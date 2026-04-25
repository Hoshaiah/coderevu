## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Callback Fires Inside Open Transaction
# ------------------------------------------------------------------------

class Order < ApplicationRecord
  belongs_to :user
  has_many :line_items

  # CHANGE 1: replaced after_create with after_create_commit so the callback fires only after the surrounding transaction has been fully committed to the database, eliminating the race where a worker dequeues the job before the row is visible.
  after_create_commit :enqueue_confirmation_job

  def total_cents
    line_items.sum(:price_cents)
  end

  private

  def enqueue_confirmation_job
    OrderConfirmationJob.perform_later(id)
  end
end

# Called from OrdersController:
# Order.transaction do
#   order = Order.create!(user: current_user, ...)
#   order.line_items.create!(product: p, price_cents: 1000)
# end
```

## Explanation

### Issue 1: Job enqueued before transaction commits

**Problem:** A small but consistent percentage of `OrderConfirmationJob` runs raise `ActiveRecord::RecordNotFound` immediately after being dequeued. The order row exists seconds later, proving the job ran before the insert was committed. The symptom correlates with write-heavy periods because the window between enqueue and commit grows under load.

**Fix:** Replace `after_create` with `after_create_commit` on line 5 of the reference solution. No other changes are needed.

**Explanation:** Rails transactional callbacks (`after_commit`, `after_create_commit`, etc.) are queued internally and only executed after the outermost `COMMIT` statement is sent to the database. `after_create`, by contrast, runs inside the transaction, immediately after the `INSERT` — so the row exists in the transaction's own session but is not yet visible to any other connection. When Sidekiq picks up the job (possibly within microseconds on a fast machine), the worker opens a fresh connection that cannot see the uncommitted row and raises `ActiveRecord::RecordNotFound`. Switching to `after_create_commit` means the callback — and therefore `perform_later` — is invoked only after `COMMIT` returns, so the row is guaranteed to be visible to every connection before the job is ever placed on the queue. A related pitfall: if you later wrap `create!` in a nested `transaction(requires_new: true)`, `after_create_commit` still waits for the outermost transaction, which is the correct behaviour.

---

### Issue 2: Callback bound only to `create`, misses other insert paths

**Problem:** `after_create` (and its transactional twin `after_create_commit`) fires only when ActiveRecord recognises the record as newly persisted via `create` or `save` on a `new_record?`. Any code path that inserts an order without going through the standard `create!` flow — such as `insert`, `insert_all`, or a subclass that overrides persistence — would never enqueue the confirmation job, and no error is raised to signal the omission.

**Fix:** `after_create_commit` already covers new-record saves through the standard persistence path, which is the correct scope here. The CHANGE 1 comment in the reference solution addresses both issues simultaneously because `after_create_commit` is the idiomatic, commit-safe replacement and keeps the intent (fire once, on insert, after commit) explicit.

**Explanation:** Rails distinguishes `after_create` (fires on INSERT) from `after_save` (fires on INSERT and UPDATE). The correct callback to use depends on what the job does: `OrderConfirmationJob` should run exactly once per new order, not on every update, so `after_create_commit` is the right scope. If the team later introduces bulk-insert paths (`insert_all`, raw SQL, fixtures in tests), those bypass all ActiveRecord callbacks entirely — a good reason to add an integration test that asserts a job is enqueued for every order-creation code path rather than trusting the callback alone.
