---
slug: activerecord-attribute-update-without-save
track: ruby
orderIndex: 16
title: Attribute Set Without Saving
difficulty: easy
tags:
  - active-record
  - rails
  - idioms
language: ruby
---

## Context

In `app/jobs/sync_subscription_status_job.rb`, a background job fetches a `User` record and updates their `subscription_status` based on a response from a third-party billing API. The job runs nightly via a cron-like scheduler.

Customer support keeps escalating tickets where users are being billed but their in-app subscription status still shows `"inactive"` the next day. The job logs show it runs without errors, and the billing API calls succeed.

A developer added extra logging and confirmed the `User` object's attribute changes as expected in memory — but checking the database directly reveals the column is never updated.

## Buggy code

```ruby
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
  rescue BillingApi::Error => e
    Rails.logger.error("Billing API error for user #{user_id}: #{e.message}")
  end
end
```
