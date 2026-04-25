## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Non-Idempotent Job Causes Duplicate Charge
# ------------------------------------------------------------------------

class ChargeSubscriptionJob < ApplicationJob
  sidekiq_options retry: 5, queue: :billing

  def perform(subscription_id)
    subscription = Subscription.find(subscription_id)
    return if subscription.current_period_paid?

    # CHANGE 1: Pass an idempotency_key derived from subscription_id and billing period so Stripe deduplicates the PaymentIntent if the job retries after a network timeout that masked a successful charge.
    idempotency_key = "charge_subscription_#{subscription_id}_#{subscription.current_period_start.to_i}"

    charge = Stripe::PaymentIntent.create(
      {
        amount: subscription.amount_cents,
        currency: 'usd',
        customer: subscription.stripe_customer_id,
        confirm: true
      },
      # CHANGE 1: Stripe uses this key to return the existing PaymentIntent instead of creating a new one when the same request is retried.
      { idempotency_key: idempotency_key }
    )

    # CHANGE 2: Wrap the local DB writes in a transaction and use find_or_create_by! on the stripe_payment_intent_id so a retry that receives the same PaymentIntent id from Stripe does not insert a duplicate charge record.
    Charge.transaction do
      subscription.charges.find_or_create_by!(stripe_payment_intent_id: charge.id) do |c|
        c.amount_cents = subscription.amount_cents
        c.billed_at    = Time.current
      end

      subscription.update!(current_period_paid: true)
    end
  end
end
```

## Explanation

### Issue 1: Missing Stripe idempotency key

**Problem:** When a Stripe API call times out on the network, Sidekiq marks the job as failed and retries it. If Stripe actually processed the charge before the timeout, the retry sends a brand-new `Stripe::PaymentIntent.create` with no deduplication signal, and Stripe creates a second, independent charge. Subscribers see two successful charges on their card.

**Fix:** Pass a second hash argument to `Stripe::PaymentIntent.create` containing `idempotency_key:` set to `"charge_subscription_#{subscription_id}_#{subscription.current_period_start.to_i}"`. This is the `# CHANGE 1` site.

**Explanation:** Stripe's idempotency-key mechanism stores the result of any API call for 24 hours and returns that cached result verbatim for any subsequent request that carries the same key. By constructing the key from `subscription_id` and the billing-period start timestamp, every retry for the same billing cycle sends the same key. If the first attempt succeeded, Stripe returns the already-created `PaymentIntent` instead of running a new charge. The key must include the period boundary — not just the subscription id — otherwise a legitimate charge in the next billing cycle would be blocked by the cached result from the previous one.

---

### Issue 2: Non-atomic local write allows duplicate charge records on retry

**Problem:** Even with an idempotency key, Stripe returns the same `PaymentIntent` object on a retry, meaning `charge.id` is identical. However, the original code calls `subscription.charges.create!` unconditionally, so a retry inserts a second `Charge` row with the same `stripe_payment_intent_id`, double-counting revenue in the local database.

**Fix:** Replace `subscription.charges.create!` with `subscription.charges.find_or_create_by!(stripe_payment_intent_id: charge.id)` inside a `Charge.transaction` block, and set the remaining attributes in the block passed to `find_or_create_by!`. This is the `# CHANGE 2` site.

**Explanation:** `find_or_create_by!` issues a `SELECT` for a row matching `stripe_payment_intent_id`, and only runs `INSERT` if none exists. Wrapping it in a transaction prevents a race condition where two concurrent retries both pass the `SELECT` check before either commits. On a retry where Stripe returns the cached `PaymentIntent`, the `SELECT` finds the row written by the first attempt, skips the `INSERT`, and still allows `subscription.update!(current_period_paid: true)` to proceed idempotently. Adding a unique index on `charges.stripe_payment_intent_id` at the database level provides a final safety net against any race that slips through at the application layer.
