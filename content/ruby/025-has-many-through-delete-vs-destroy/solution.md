## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Join Record Skips Callbacks on Delete
# ------------------------------------------------------------------------

class Project < ApplicationRecord
  # CHANGE 1: Switch from :delete_all to :destroy_all so ActiveRecord loads each Membership record and runs its after_destroy callbacks before issuing the DELETE.
  has_many :memberships, dependent: :destroy_all
  has_many :members, through: :memberships, source: :user

  def remove_member(user)
    # CHANGE 2: Use destroy_all instead of delete_all so each matched Membership is instantiated and its after_destroy callbacks (email + seat decrement) are executed.
    memberships.where(user: user).destroy_all
  end
end

class Membership < ApplicationRecord
  belongs_to :project
  belongs_to :user

  after_destroy :send_removal_notification
  after_destroy :decrement_seat_count

  private

  def send_removal_notification
    MembershipMailer.removed(self).deliver_later
  end

  def decrement_seat_count
    project.account.decrement!(:seat_count)
  end
end
```

## Explanation

### Issue 1: `dependent: :delete_all` skips callbacks on project destroy

**Problem:** When a `Project` is destroyed, none of the `Membership` `after_destroy` callbacks run. No notification emails are sent and `seat_count` is never decremented, causing the billing counter to drift.

**Fix:** Replace `dependent: :delete_all` with `dependent: :destroy_all` on the `has_many :memberships` declaration in `Project`.

**Explanation:** `delete_all` tells ActiveRecord to issue a single `DELETE FROM memberships WHERE project_id = ?` SQL statement without ever loading the individual records. Because the records are never instantiated as Ruby objects, ActiveRecord has no way to run the `after_destroy` callbacks defined on `Membership`. `destroy_all` instead loads every matching `Membership` record and calls `destroy` on each one individually, which runs the full callback chain before issuing each DELETE. The trade-off is extra queries (one per membership), but that is the only way to guarantee callbacks execute. If performance is a concern for bulk deletes, the callbacks themselves should be moved to a background job that is triggered explicitly, rather than disabling the callback mechanism entirely.

---

### Issue 2: `delete_all` in `remove_member` skips callbacks on individual removal

**Problem:** Calling `remove_member` on a project also never triggers the `after_destroy` callbacks. The notification email is not sent and the seat count is not decremented, regardless of whether the project itself is being destroyed.

**Fix:** Replace `memberships.where(user: user).delete_all` with `memberships.where(user: user).destroy_all` inside the `remove_member` method.

**Explanation:** Just like `dependent: :delete_all`, calling `delete_all` on an ActiveRecord relation issues a bare SQL DELETE without instantiating the records, so the callback chain on each `Membership` is never entered. `destroy_all` on a relation loads each matching record and calls `destroy` on it, which fires `before_destroy`, the DELETE, and then `after_destroy` in sequence. This is the same mechanism as Issue 1 but at the method level rather than the association level, so it needs its own fix independently. A subtle related pitfall: if you use `find` followed by a single `record.delete` call, that also bypasses callbacks — only `record.destroy` is callback-safe.
