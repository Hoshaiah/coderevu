---
slug: find-each-with-order
track: ruby
orderIndex: 23
title: Batched Find Ignores Custom Order
difficulty: medium
tags:
  - active-record
  - idioms
  - rails
language: ruby
---

## Context

This background job lives in `app/jobs/invoice_generation_job.rb` in a Rails 7 billing system. At month-end, the job iterates over all active subscriptions and generates invoices in the order they were signed up (oldest customers first, per a business requirement for processing priority). The job uses `find_each` to avoid loading all records into memory at once — subscriptions can number in the hundreds of thousands.

The billing team noticed that invoices are not generated in signup-date order. They verified the `ORDER BY` clause is present in the query. Adding `.to_a` and then iterating makes the ordering work correctly, but that defeats the memory-efficiency goal.

The team suspects a database quirk and opened a ticket with the DBA, who confirmed the queries look correct in the Postgres `EXPLAIN` output. The issue is actually in the Ruby layer.

## Buggy code

```ruby
class InvoiceGenerationJob < ApplicationJob
  queue_as :billing

  def perform(billing_period)
    Subscription
      .active
      .order(:created_at)
      .find_each(batch_size: 500) do |subscription|
        InvoiceService.generate(subscription, billing_period)
      end
  end
end
```
