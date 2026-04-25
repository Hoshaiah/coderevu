---
slug: after-rollback-missing-callback
track: ruby
orderIndex: 31
title: after_rollback Callback Never Fires
difficulty: medium
tags:
  - active-record
  - concurrency
  - correctness
language: ruby
---

## Context

This code lives in `app/models/payment.rb`. When a payment record is created, the model enqueues a `PaymentNotificationJob` to email the customer. To avoid sending emails for payments that ultimately fail to save (due to validation or DB errors), the team moved the job enqueue to `after_create_commit` — but then found they also needed cleanup logic if a payment is rolled back, so they added an `after_rollback` callback.

The ops team noticed that whenever a payment creation fails inside a nested `transaction` block (e.g., when called from `OrderFulfillmentService`), the `after_rollback` callback is never triggered on the `Payment` model, even though the payment record was definitely not saved. Cleanup jobs accumulate without the corresponding rollback handler ever running.

The team verified that `after_rollback` fires correctly in tests that exercise payment creation in isolation, but not when the payment is created inside an outer transaction managed by the order service.

## Buggy code

```ruby
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

      payment = Payment.create!(
        order: order,
        amount: order.total,
        processor: "stripe"
      )

      charge_stripe(payment)
    end
  end
end
```
