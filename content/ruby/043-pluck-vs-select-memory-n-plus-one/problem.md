---
slug: pluck-vs-select-memory-n-plus-one
track: ruby
orderIndex: 43
title: N+1 Inside Select Block
difficulty: easy
tags:
  - n+1
  - active-record
  - performance
language: ruby
---

## Context

This code lives in `app/services/report/monthly_summary_service.rb`. It generates a monthly revenue report grouped by customer, used by the finance team. The report runs nightly as a scheduled Sidekiq job and emails results to the finance mailing list. It queries all orders from the past month and computes per-customer totals.

As the customer base grew past 10,000, the nightly job started timing out after its 5-minute deadline. The Sidekiq logs show the job taking 8-12 minutes. New Relic traces reveal thousands of individual SQL queries against the `customers` table, each fetching one row.

The developer who wrote this thought `select` on an ActiveRecord relation was like SQL `SELECT` — a single query. The code looks clean and readable, so the bug isn't obvious at first glance.

## Buggy code

```ruby
class Report::MonthlySummaryService
  def self.call(month: Date.current.beginning_of_month)
    period_start = month
    period_end = month.end_of_month

    orders = Order.where(created_at: period_start..period_end)
                  .where(status: :completed)
                  .includes(:line_items)

    summary = orders.select { |order| order.customer.active? }
                    .group_by { |order| order.customer_id }
                    .transform_values do |customer_orders|
                      {
                        total: customer_orders.sum(&:total_cents),
                        count: customer_orders.size
                      }
                    end

    summary
  end
end
```
