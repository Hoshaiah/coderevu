---
slug: after-save-callback-sends-duplicate-email
track: ruby
orderIndex: 27
title: After-Save Email Fires Twice
difficulty: medium
tags:
  - active-record
  - rails
  - callbacks
language: ruby
---

## Context

`app/models/order.rb` uses an ActiveRecord callback to send a confirmation email whenever an order record is saved. The feature was introduced to guarantee the email fires regardless of which code path creates or updates the order — controller, background job, or admin console.

Customers and the support team started reporting duplicate confirmation emails — two identical emails seconds apart — for a subset of orders. The issue does not reproduce every time; it seems correlated with orders that go through a multi-step checkout that calls `order.save` more than once (once to lock in the cart, once to attach payment).

The team verified the mailer itself is idempotent and not enqueueing jobs twice. All duplicate sends trace back to the callback firing on every save, including updates to already-confirmed orders.

## Buggy code

```ruby
class Order < ApplicationRecord
  after_save :send_confirmation_email

  private

  def send_confirmation_email
    OrderMailer.confirmation(self).deliver_later
  end
end
```
