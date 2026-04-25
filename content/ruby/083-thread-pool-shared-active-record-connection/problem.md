---
slug: thread-pool-shared-active-record-connection
track: ruby
orderIndex: 83
title: Shared Connection Across Threads
difficulty: hard
tags:
  - concurrency
  - active-record
  - rails
language: ruby
---

## Context

`app/jobs/bulk_report_job.rb` is a Sidekiq job that processes a large report by parallelising database reads across a pool of Ruby threads. The job was written to speed up a slow nightly report that previously ran serially. It uses `Thread.new` blocks to fan out queries.

Operators have seen intermittent `ActiveRecord::StatementInvalid` errors and occasional rows appearing in the wrong report section. The errors are non-deterministic — the job sometimes completes cleanly and sometimes crashes. The errors are always one of: `PG::InFailedSqlTransaction`, `ActiveRecord::ConnectionTimeoutError`, or garbled result sets.

The team ruled out database-level issues — the Postgres server is healthy and the connection pool size is configured correctly in `database.yml`. The problem reproduces reliably under load but not in single-threaded test runs.

## Buggy code

```ruby
class BulkReportJob
  include Sidekiq::Job

  def perform(report_id)
    report = Report.find(report_id)
    segments = report.segments.to_a

    results = []
    mutex = Mutex.new

    threads = segments.map do |segment|
      Thread.new do
        # Each thread re-uses whatever AR connection is current — dangerous!
        rows = Order.where(segment_id: segment.id).to_a
        mutex.synchronize { results << { segment: segment.id, rows: rows } }
      end
    end

    threads.each(&:join)
    ReportBuilder.compile(results)
  end
end
```
