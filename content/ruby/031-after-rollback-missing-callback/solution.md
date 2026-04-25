## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — after_rollback Callback Never Fires
# ------------------------------------------------------------------------

# app/models/payment.rb
class Payment < ApplicationRecord
  belongs_to :order

  after_create_commit :enqueue_notification
  after_rollback :cleanup_failed_payment

  private

  def enqueue_notification
    PaymentNotificationJob.perform_later(id)
  end

  def cleanup_failed_payment
    Rails.logger.info "Payment rollback cleanup for order #{order_id}"
    FailedPaymentCleanupJob.perform_later(order_id)
  end
end

# app/services/order_fulfillment_service.rb
class OrderFulfillmentService
  def call(order)
    ActiveRecord::Base.transaction do
      order.update!(status: :processing)

      # CHANGE 1: Wrap the payment creation and stripe charge in a nested transaction with requires_new: true so that Rails establishes a savepoint, and after_rollback on Payment fires when that savepoint is rolled back rather than being swallowed by the outer transaction with no callback.
      payment = ActiveRecord::Base.transaction(requires_new: true) do
        p = Payment.create!(
          order: order,
          amount: order.total,
          processor: "stripe"
        )
        # CHANGE 2: Move charge_stripe inside the nested transaction so that a stripe failure triggers a rollback of the savepoint, which causes after_rollback to fire on the Payment record created within that same savepoint boundary.
        charge_stripe(p)
        p
      end
    end
  end
end
```

## Explanation

### Issue 1: `after_rollback` skipped in nested transaction

**Problem:** When `Payment.create!` is called inside `OrderFulfillmentService`'s outer `ActiveRecord::Base.transaction` block, Rails enrolls the Payment record in that outer transaction. If anything raises and the outer transaction rolls back, Rails is supposed to fire `after_rollback` on every enrolled record — but in practice, when the Payment record has never been associated with a dedicated savepoint (a nested transaction opened with `requires_new: true`), the callback machinery does not reliably detect and fire `after_rollback` at the model level inside Rails' transaction-state tracking, especially across versions. The ops team sees cleanup jobs never fire even though the payment was definitely not persisted.

**Fix:** Wrap the `Payment.create!` call in `ActiveRecord::Base.transaction(requires_new: true)` at the CHANGE 1 site. This forces Rails to open a savepoint for that inner block, giving the Payment record a distinct transaction boundary that Rails can independently roll back and on which it will invoke `after_rollback`.

**Explanation:** Rails implements `after_rollback` by hooking into `ActiveRecord::ConnectionAdapters::Transaction` lifecycle events. Each record is registered with the transaction object that was current when the record was first saved. Without `requires_new: true`, the inner `Payment.create!` is registered against the outer transaction object. When the outer transaction rolls back entirely, Rails does iterate enrolled records and fire `after_rollback`, but only if the connection adapter correctly maps that transaction to the record's enrollment record. In practice, versions of Rails before 7.1 have a known gap: if the record's enrollment transaction is the outermost one and the rollback is triggered by a nested raise, some adapter paths skip the callback. Using `requires_new: true` creates an explicit savepoint transaction object; Rails registers the Payment against that object, and when the savepoint rolls back (even if the outer transaction ultimately also rolls back), Rails fires `after_rollback` on the Payment at the inner boundary. A related pitfall: if you rescue the inner transaction's exception and allow the outer transaction to commit, `after_rollback` still correctly fires for the inner savepoint, which is the behavior you usually want.

---

### Issue 2: `charge_stripe` outside the savepoint boundary

**Problem:** In the original code, `charge_stripe(payment)` is called after `Payment.create!` but at the outer transaction scope. If `charge_stripe` raises, the outer transaction rolls back, but the Payment record was created and enrolled in the outer transaction, not in any savepoint. This means the rollback of the outer transaction does trigger `after_rollback` attempts, but because the record has no sub-transaction registration, the callback is unreliable (as described in Issue 1). Additionally, keeping `charge_stripe` outside any nested block means you cannot independently retry or rescue just the payment+charge step without rolling back unrelated outer-transaction work like `order.update!`.

**Fix:** Move `charge_stripe(p)` inside the `requires_new: true` block at the CHANGE 2 site, after `Payment.create!`. Both the record creation and the charge now live within the same savepoint, so any failure in either rolls back only that savepoint and fires `after_rollback` on the Payment.

**Explanation:** The savepoint created by `requires_new: true` covers every database write and every ActiveRecord enrollment that happens inside its block. By placing both `Payment.create!` and `charge_stripe` inside that block, you guarantee that a stripe failure unwinds exactly the Payment insert (the savepoint rolls back) and Rails fires `after_rollback` on the Payment object, while the outer transaction's work (like `order.update!`) remains intact unless the outer code also chooses to raise. If `charge_stripe` were left outside the inner block, a failure there would reach the outer rescue path and roll back the entire outer transaction, which is a broader rollback than intended and still risks missing the `after_rollback` callback depending on the Rails version. Keeping them together inside the savepoint makes the failure scope explicit and the callback behavior deterministic.
