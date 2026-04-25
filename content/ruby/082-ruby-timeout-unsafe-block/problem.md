---
slug: ruby-timeout-unsafe-block
track: ruby
orderIndex: 82
title: Timeout Kills Mid-Transaction Safely
difficulty: hard
tags:
  - concurrency
  - ruby
  - active-record
language: ruby
---

## Context

`lib/external/payment_client.rb` wraps an HTTP call to a payment gateway. To prevent requests from hanging indefinitely, the team wrapped the call in Ruby's standard `Timeout::timeout`. The code is used inside a background job that also opens an ActiveRecord transaction around the payment record update. This pattern was copied from a Stack Overflow answer.

After deploying, the team noticed occasional cases where the payment gateway was charged but the local database record was not updated — a split-charge state. Database connection pool exhaustion errors also started appearing under load. Both symptoms are intermittent and hard to reproduce in staging.

The `Timeout` gem is the root cause, but the failure mode is non-obvious and was not flagged in code review.

## Buggy code

```ruby
require "timeout"equire "net/http"

class PaymentClient
  GATEWAY_TIMEOUT = 10

  def self.charge(user:, amount_cents:)
    Timeout::timeout(GATEWAY_TIMEOUT) do
      ActiveRecord::Base.transaction do
        payment = Payment.create!(user: user, amount_cents: amount_cents, status: :pending)

        response = Net::HTTP.post(
          URI("https://gateway.example.com/charge"),
          { amount: amount_cents, token: user.payment_token }.to_json,
          "Content-Type" => "application/json"
        )

        payment.update!(status: :completed, gateway_ref: JSON.parse(response.body)["ref"])
      end
    end
  rescue Timeout::Error
    Rails.logger.error("Payment gateway timed out for user #{user.id}")
    false
  end
end
```
