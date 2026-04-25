## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — After-Save Email Fires Twice
# ------------------------------------------------------------------------

class Order < ApplicationRecord
  # CHANGE 1: Use after_create_commit instead of after_save so the callback only fires once, when the record is first inserted, not on every subsequent update.
  after_create_commit :send_confirmation_email

  private

  def send_confirmation_email
    # CHANGE 2: Guard with a confirmed_at (or equivalent status) check so that if the record somehow already has a confirmation timestamp, the mailer is not invoked again.
    return if confirmed_at.present?
    OrderMailer.confirmation(self).deliver_later
  end
end
```

## Explanation

### Issue 1: Callback fires on every save

**Problem:** Every time `order.save` is called — whether it is the first insert or a subsequent update — ActiveRecord runs the `after_save` callback and enqueues a confirmation email. During the multi-step checkout, `save` is called twice (once to lock the cart, once to attach payment), so two emails go out for the same order.

**Fix:** Replace `after_save` with `after_create_commit` so the callback is bound only to the initial `INSERT` transaction, not to any later `UPDATE`.

**Explanation:** `after_save` runs after both `INSERT` and `UPDATE` operations. `after_create_commit` runs only after the first `INSERT` is committed to the database. Because the checkout flow calls `save` on an already-persisted record the second time, `after_save` fires again and a second email is enqueued. Switching to `after_create_commit` means the mailer is called exactly once per order record. Note that `after_create_commit` (rather than `after_create`) also waits for the database transaction to commit before firing, which prevents the mailer job from trying to load the record before it is visible in the DB — a related pitfall when using `deliver_later` inside bare `after_create`.

---

### Issue 2: No guard against re-sending to already-confirmed orders

**Problem:** Even after fixing the callback to `after_create_commit`, a future admin action or background job that touches the order record could still trigger the callback if the code is ever changed back or if another callback path is added. More immediately, if `confirmed_at` is set in the same transaction as the first save, there is no idempotency check in the mailer dispatch itself.

**Fix:** Add `return if confirmed_at.present?` at the top of `send_confirmation_email` so the method exits early when the order already has a confirmation timestamp.

**Explanation:** The `after_create_commit` change prevents duplicate sends under normal flow, but a defensive check inside the method provides a second layer of protection. If `confirmed_at` is already set — for example, because the record was seeded or imported with a pre-existing timestamp, or because a future developer re-adds an `after_save` by mistake — the guard stops the email from going out again. This pattern is sometimes called an idempotency guard: the method checks whether its side-effect has already happened before repeating it. You will need a `confirmed_at` timestamp column (or an equivalent `status == 'confirmed'` field) on the `orders` table; if your schema uses a different sentinel, replace `confirmed_at.present?` with the appropriate check.
