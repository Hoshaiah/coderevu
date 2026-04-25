## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Post comment counts are permanently wrong after comments are deleted
# ------------------------------------------------------------------------
# app/models/comment.rb
class Comment < ApplicationRecord
  belongs_to :post

  after_create  :increment_post_counter
  after_destroy :decrement_post_counter

  private

  def increment_post_counter
    # CHANGE 1 & 2: Use a single atomic SQL increment instead of read-then-write.
    # This avoids the race condition and never relies on the stale in-memory value.
    post.class.where(id: post.id).update_all('comments_count = comments_count + 1')
  end

  def decrement_post_counter
    # CHANGE 1 & 2: Same atomic SQL decrement; the database computes the new value,
    # so concurrent writers and stale cached attributes cannot corrupt the count.
    post.class.where(id: post.id).update_all('comments_count = GREATEST(comments_count - 1, 0)')
  end
end
```

## Explanation

### Issue 1: Race condition in read-modify-write counter update

**Problem:** When two comments are created or destroyed at nearly the same time, both processes read the same `comments_count` value, each adds or subtracts 1, and both write back the same result. One increment or decrement is lost, so the stored count drifts further from reality with every concurrent operation.

**Fix:** Replace `post.update_column(:comments_count, post.comments_count + 1)` with `post.class.where(id: post.id).update_all('comments_count = comments_count + 1')`. The arithmetic now happens inside a single SQL `UPDATE` statement, so the database applies the delta atomically.

**Explanation:** The original code issues a `SELECT` (implicit when reading `post.comments_count`) and then a separate `UPDATE`. Between those two statements another transaction can issue its own `SELECT`/`UPDATE` pair. Both reads see the same value, both writes store `old_value + 1`, and the net effect is `+1` instead of `+2`. Using `UPDATE posts SET comments_count = comments_count + 1` pushes the addition into the database engine, which serializes it correctly. A related pitfall: even with a database-level increment, the in-memory `post` object's `comments_count` attribute is now stale, but since we never read it for the arithmetic any more, that no longer matters.

---

### Issue 2: Stale cached association causes wrong arithmetic base

**Problem:** If anything else changes `comments_count` after `post` was first loaded into memory — another request, a background job, a previous callback — `post.comments_count` returns the old cached value. Subtracting 1 from a stale value produces an incorrect result, which is why counts end up higher than the real number after deletions: the cached object often hasn't seen previous decrements.

**Fix:** Remove the dependency on the in-memory `post.comments_count` attribute entirely. `update_all('comments_count = comments_count - 1')` reads and writes the column in one SQL statement, so the Ruby-side cache is never consulted.

**Explanation:** ActiveRecord caches attribute values on the model instance at load time. Calling `post.comments_count` returns whatever value was fetched when the `post` record was last loaded, not the current database value. If the record is long-lived (e.g., kept in an instance variable across a request or loaded once and reused) it will be stale. You can force a reload with `post.reload.comments_count`, but that introduces an extra query and still leaves a window between the reload and the write. Doing the arithmetic in SQL eliminates the cache-staleness problem entirely and removes the extra `SELECT`.
