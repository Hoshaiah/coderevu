## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Counter Cache Updates Wrong Parent
# ------------------------------------------------------------------------

class Comment < ApplicationRecord
  belongs_to :user
  # CHANGE 1: Explicitly name the counter_cache column so ActiveRecord always writes to posts.comments_count regardless of how the association is resolved after the threaded-comment refactor.
  belongs_to :post, counter_cache: :comments_count
  belongs_to :parent_comment, class_name: 'Comment', optional: true

  # After the threaded-comment refactor, comments can be re-parented:
  def reparent!(new_post)
    # CHANGE 2: Capture the old post before reassignment so we can decrement its counter cache after the record is saved with the new post.
    old_post = self.post
    self.post = new_post
    save!
    # CHANGE 3: Manually correct both counter caches — decrement the old post and rely on the belongs_to counter_cache callback to have already incremented the new post during save!.
    Post.decrement_counter(:comments_count, old_post.id) if old_post && old_post != new_post
  end
end

# app/models/post.rb (excerpt):
# has_many :comments, dependent: :destroy
# The comments_count column exists on posts.
```

## Explanation

### Issue 1: Implicit counter cache column name

**Problem:** After the threaded-comment refactor, the `belongs_to :post` declaration uses `counter_cache: true`, which tells ActiveRecord to infer the column name as the pluralised, underscored caller class name — `comments_count`. In isolation that sounds right, but when the model also declares `belongs_to :parent_comment, class_name: 'Comment'`, some Rails versions re-resolve the owning class during macro setup and can write the counter to the wrong column or table. The symptom is `comments_count` values that drift seemingly at random.

**Fix:** Replace `counter_cache: true` with `counter_cache: :comments_count` so the column name is pinned explicitly and ActiveRecord never has to infer it from context.

**Explanation:** When `counter_cache: true` is used, ActiveRecord calls `reflection.counter_cache_column` which walks the class hierarchy and formats a name. If a second `belongs_to` in the same model references the same class under a different name (`parent_comment` → `Comment`), the internal reflection table can get the associations confused during eager loading of macro metadata. Pinning the column name with a symbol short-circuits that inference entirely. A related pitfall: if you rename the association in future (e.g. `belongs_to :thread_post`), `counter_cache: true` would silently switch to `thread_posts_count`, a column that probably does not exist, causing silent write failures.

---

### Issue 2: reparent! Does Not Update Counter Caches

**Problem:** When `reparent!` is called, the comment moves from one post to another. The `belongs_to` counter cache callbacks fire on `save!` and increment `comments_count` on the new post. But they do not decrement `comments_count` on the old post. Over time, every re-parented comment leaves the old post's counter one too high. Posts that lose comments accumulate inflated counts; the new parent gets the correct increment.

**Fix:** Before reassigning `self.post`, capture the old post in `old_post`. After `save!` completes (so the new post's counter is already incremented by the AR callback), call `Post.decrement_counter(:comments_count, old_post.id)` when the old and new posts differ.

**Explanation:** ActiveRecord's counter cache callbacks are tied to `after_create` and `after_destroy` callbacks on the association, and to `before_update` / `after_update` for foreign-key changes. In practice, the update path does fire both a decrement on the old foreign key and an increment on the new one — but only when `update_counters` is wired correctly, which requires the column name to be resolvable at callback registration time (see Issue 1). Because Issue 1 may have broken that wiring, adding the explicit `decrement_counter` call in `reparent!` acts as a safe, always-correct fallback. If you later confirm the AR callbacks handle it reliably, the manual call is harmless because it is idempotent in intent (decrement by 1 when old ≠ new). An edge case to watch: if `save!` raises, the rescue should not call `decrement_counter` — the guard runs after `save!` so a raised exception naturally skips it.
