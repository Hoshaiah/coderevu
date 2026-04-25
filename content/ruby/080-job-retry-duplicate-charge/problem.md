---
slug: job-retry-duplicate-charge
track: ruby
orderIndex: 80
title: Non-Idempotent Job Causes Duplicate Charge
difficulty: hard
tags:
  - concurrency
  - rails
  - active-record
language: ruby
---

## Context

The Sidekiq job in `app/jobs/charge_subscription_job.rb` is enqueued once per billing cycle per subscriber. It calls the Stripe API to charge the customer and then records the charge in the local database. Sidekiq is configured with `retry: 5` for this queue, which is standard for transient network failures.

Support started receiving complaints from subscribers who were charged two or three times in the same billing period. Stripe's dashboard showed multiple successful `PaymentIntent` objects for the same subscriber on the same day. The Sidekiq dead-job queue was nearly empty, suggesting the job was completing successfully on a retry after also succeeding on the first attempt.

The team confirmed that Stripe API calls occasionally return a network timeout even when the charge succeeded on Stripe's side, causing Sidekiq to retry a job that had already charged the customer.

## Buggy code

```ruby
class ChargeSubscriptionJob < ApplicationJob
  sidekiq_options retry: 5, queue: :billing

  def perform(subscription_id)
    subscription = Subscription.find(subscription_id)
    return if subscription.current_period_paid?

    charge = Stripe::PaymentIntent.create(
      amount: subscription.amount_cents,
      currency: 'usd',
      customer: subscription.stripe_customer_id,
      confirm: true
    )

    subscription.charges.create!(
      stripe_payment_intent_id: charge.id,
      amount_cents: subscription.amount_cents,
      billed_at: Time.current
    )

    subscription.update!(current_period_paid: true)
  end
end
```
