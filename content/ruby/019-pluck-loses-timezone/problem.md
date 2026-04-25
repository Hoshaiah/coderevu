---
slug: pluck-loses-timezone
track: ruby
orderIndex: 19
title: Pluck Bypasses Time Zone Conversion
difficulty: medium
tags:
  - active-record
  - rails
  - idioms
language: ruby
---

## Context

The file `app/services/subscription_expiry_checker.rb` runs as a nightly Sidekiq job. It loads upcoming subscription expiry timestamps and compares them to the current time to decide which users should receive a warning email. The app sets `config.time_zone = 'Eastern Time (US & Canada)'` in `application.rb` and stores all timestamps as UTC in the database.

Users in US time zones intermittently receive warning emails a few hours too early — specifically, subscribers whose plan expires around midnight Eastern time get the email the afternoon before. The issue doesn't appear in development because the developer machines happen to be in the Eastern time zone.

The team verified that the `subscriptions` table stores `expires_at` as UTC and that `Time.zone.now` returns the correct Eastern wall-clock time. They also confirmed that the SQL query itself returns the right rows when inspected via `to_sql`.

## Buggy code

```ruby
class SubscriptionExpiryChecker
  WARNING_WINDOW = 24.hours

  def self.call
    expiry_times = Subscription.where(status: :active)
                               .pluck(:expires_at)

    expiry_times.each do |expires_at|
      if expires_at <= Time.zone.now + WARNING_WINDOW
        user = Subscription.find_by(expires_at: expires_at)&.user
        WarningMailer.expiry_warning(user).deliver_later if user
      end
    end
  end
end
```
