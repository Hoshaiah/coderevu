## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Attribute Set Without Saving
# ------------------------------------------------------------------------

# app/jobs/sync_subscription_status_job.rb
class SyncSubscriptionStatusJob < ApplicationJob
  queue_as :default

  def perform(user_id)
    user = User.find(user_id)
    response = BillingApi.subscription_status(user.billing_customer_id)

    if response.active?
      user.subscription_status = "active"
      user.subscription_expires_at = response.expires_at
    else
      user.subscription_status = "inactive"
      user.subscription_expires_at = nil
    end

    Rails.logger.info("Synced subscription for user #{user_id}: #{user.subscription_status}")
    # CHANGE 1: Call save! to persist the attribute changes to the database; without this the in-memory object is updated but the DB row never changes.
    user.save!
  rescue BillingApi::Error => e
    Rails.logger.error("Billing API error for user #{user_id}: #{e.message}")
    # CHANGE 2: Re-raise the error so ActiveJob marks the job as failed and can retry it on transient billing API errors instead of silently succeeding.
    raise
  end
end
```

## Explanation

### Issue 1: Attribute Changes Never Persisted

**Problem:** Users are billed correctly by the third-party API, but their in-app `subscription_status` remains `"inactive"` the next day. The job logs show the attribute being set to `"active"` in memory, but a direct database query confirms the column is never updated.

**Fix:** Add `user.save!` immediately after the logger line. This is the only change at the CHANGE 1 site — one method call that writes the dirty attributes to the database.

**Explanation:** ActiveRecord does not automatically flush attribute assignments to the database. Assigning `user.subscription_status = "active"` mutates the in-memory Ruby object and marks the attribute as dirty, but nothing is written to the database until `save`, `save!`, `update`, or a similar persistence method is called. Because the job never called any of these, every nightly run would log the "correct" value from the in-memory object and then exit, leaving the database row completely unchanged. Using `save!` (with a bang) rather than `save` is preferable here because it raises `ActiveRecord::RecordInvalid` if validations fail, surfacing data problems immediately rather than silently doing nothing.

---

### Issue 2: Swallowed Exception Prevents Retries

**Problem:** When the billing API returns an error, the job logs the message, returns normally, and the scheduler records the job as successful. Transient failures (network timeouts, rate limits, temporary API outages) are never retried, leaving users with stale subscription data indefinitely.

**Fix:** Add a bare `raise` at the end of the `rescue BillingApi::Error` block (CHANGE 2 site). This re-raises the caught exception after logging it, so ActiveJob sees a failed job and can apply its retry policy.

**Explanation:** A `rescue` block that does not re-raise the exception consumes it entirely — from Ruby's perspective the method returned normally. ActiveJob only considers a job failed (and eligible for retry) when the `perform` method raises an unhandled exception. By logging and then swallowing the error, the original code makes transient billing API problems invisible to the job queue. Adding `raise` (with no argument) inside the rescue block re-raises the same `BillingApi::Error` instance, preserving the original message and backtrace while letting ActiveJob's retry and dead-letter queue mechanisms take over. If you want to limit retries or add backoff, you can pair this with `retry_on BillingApi::Error, wait: :exponentially_longer, attempts: 5` at the class level, but that is only useful once the exception is actually allowed to propagate.
