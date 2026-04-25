---
slug: after-commit-in-transaction
track: ruby
orderIndex: 34
title: Callback Fires Inside Open Transaction
difficulty: hard
tags:
  - active-record
  - rails
  - concurrency
language: ruby
---

## Context

The file `app/models/order.rb` defines an `after_create` callback that enqueues a Sidekiq job to send a confirmation email and reserve inventory. The pattern has been in production for months and generally works, but a small percentage of jobs fail with `ActiveRecord::RecordNotFound` immediately after being dequeued, even though the order clearly exists in the database seconds later.

The error rate correlates with periods of high write load. Engineers have confirmed the jobs are enqueued by inspecting the Sidekiq queue, and the orders do eventually appear in the database — the timing is the issue. No exceptions are raised during order creation itself.

The team ruled out replication lag because the issue occurs even when jobs are processed by workers hitting the primary database.

## Buggy code

```ruby
class Order < ApplicationRecord
  belongs_to :user
  has_many :line_items

  after_create :enqueue_confirmation_job

  def total_cents
    line_items.sum(:price_cents)
  end

  private

  def enqueue_confirmation_job
    OrderConfirmationJob.perform_later(id)
  end
end

# Called from OrdersController:
# Order.transaction do
#   order = Order.create!(user: current_user, ...)
#   order.line_items.create!(product: p, price_cents: 1000)
# end
```
