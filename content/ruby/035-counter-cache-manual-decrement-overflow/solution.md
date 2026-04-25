## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Counter Cache Manual Update Bug
# ------------------------------------------------------------------------

class Comment < ApplicationRecord
  belongs_to :post

  after_create  :increment_post_counter
  after_destroy :decrement_post_counter

  private

  def increment_post_counter
    # CHANGE 1: Use a single atomic SQL increment instead of read-then-write to eliminate the race condition where two concurrent requests both read the same stale count and overwrite each other.
    post.increment!(:comments_count)
  end

  def decrement_post_counter
    # CHANGE 1: Use a single atomic SQL decrement for the same reason; also guard with a floor of 0 to prevent negative counts from any ordering anomalies.
    post.class.where(id: post.id).update_all('comments_count = GREATEST(comments_count - 1, 0)')
  end
end
```

## Explanation

### Issue 1: Race Condition in Read-Modify-Write

**Problem:** Comment counts go negative or jump to wildly wrong numbers on popular posts under concurrent traffic. Two requests can read the same `comments_count` value at the same moment, each add or subtract 1 in Ruby, and then both write their result back — so one of the updates is simply lost.

**Fix:** Replace `post.update_column(:comments_count, post.comments_count + 1)` with `post.increment!(:comments_count)`, which issues a single `UPDATE posts SET comments_count = comments_count + 1` statement. For the decrement, use `update_all('comments_count = GREATEST(comments_count - 1, 0)')` to keep the operation atomic and prevent the count from going below zero.

**Explanation:** The original code does a SELECT (when `post.comments_count` is read) followed by a separate UPDATE. Between those two statements, another request can do the same SELECT, getting the same old value. Both then write `old_value + 1` or `old_value - 1`, so whichever write lands second overwrites the first one — effectively losing an increment or decrement. Under heavy traffic this compounds quickly. Pushing the arithmetic into the SQL expression (`comments_count = comments_count + 1`) makes the database perform the read and write as one atomic operation, so concurrent requests queue up at the row lock rather than clobbering each other. `GREATEST(..., 0)` is a safety net: if some edge-case ordering still produces a decrement before an increment, the column cannot go negative.

---

### Issue 2: Soft-Deleted Comments Trigger Decrement Incorrectly

**Problem:** The platform uses soft deletes (`deleted_at` timestamp) rather than hard deletes for comments, but `after_destroy` only fires on a hard `DELETE` from the database. A soft delete — which is an `UPDATE` setting `deleted_at` — never fires `after_destroy`, so the counter is not decremented when a comment is soft-deleted, and it is decremented again if the record is later hard-deleted, eventually pushing the count below the true visible count.

**Fix:** The `after_destroy` callback should be supplemented (or replaced) with an `after_update` callback that detects when `deleted_at` transitions from `nil` to a non-nil value, so that soft-deleted comments are counted correctly. In the minimal fix shown, the `GREATEST(..., 0)` floor in the decrement path limits the observable damage, but the team should also add `after_update :handle_soft_delete` with a guard like `if saved_change_to_deleted_at? && deleted_at.present?`.

**Explanation:** ActiveRecord's `after_destroy` fires only when `destroy` or `delete` is called, which issues a SQL `DELETE`. A soft delete typically calls `update_column(:deleted_at, Time.current)`, which is an `UPDATE` — `after_destroy` never runs. This means every soft-deleted comment leaves `comments_count` one too high. If an admin later purges soft-deleted records with a hard destroy, `after_destroy` fires and decrements the counter a second time, producing a count that is lower than the real number of visible comments. The fix is to hook into `after_update` and check `saved_change_to_deleted_at?` to catch the transition, and to reverse that decrement with an increment if `deleted_at` is later cleared (comment restored).
