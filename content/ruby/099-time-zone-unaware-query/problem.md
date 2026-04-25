---
slug: time-zone-unaware-query
track: ruby
orderIndex: 99
title: Time Zone Aware Query Boundaries
difficulty: medium
tags:
  - time-zones
  - active-record
  - correctness
language: ruby
---

## Context

A background job runs every morning and emails a daily order count to the ops team. The app's `config.time_zone` is set to `'Eastern Time (US & Canada)'`, and the database stores timestamps in UTC.

Ops noticed that orders placed between midnight and ~5 AM Eastern are being double-counted: they appear in yesterday's report AND today's report. Orders placed in the last hour of the day are sometimes missing entirely.

## Buggy code

```ruby
# app/jobs/daily_order_report_job.rb
class DailyOrderReportJob < ApplicationJob
  queue_as :default

  def perform(date = Date.today)
    start_time = date.to_time
    end_time   = (date + 1).to_time

    count = Order
      .where(created_at: start_time...end_time)
      .count

    ReportMailer.daily_summary(date: date, count: count).deliver_now
  end
end
```
