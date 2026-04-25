---
slug: sidekiq-job-global-state-leak
track: ruby
orderIndex: 81
title: Thread-Local Leak Between Jobs
difficulty: hard
tags:
  - concurrency
  - security
  - sidekiq
language: ruby
---

## Context

This middleware and job pair lives in `app/workers/report_worker.rb` and `config/initializers/sidekiq.rb`. The app uses Sidekiq with a thread pool (concurrency: 10) and stores the current tenant identifier in a thread-local variable so the ActiveRecord connection can filter all queries by `account_id` through a default scope. A custom Sidekiq server middleware is supposed to set and clear the tenant on each job execution.

Operators noticed that some reports contained rows belonging to the wrong tenant — specifically, a tenant's report sometimes included data from a *different* tenant that had a job run just before on the same thread. The bug is intermittent and only appears under load when multiple tenants submit jobs close together.

The team verified that the `around` middleware is being called (they added logging) and that it sets `Current.account_id` correctly at job start. They have not been able to reproduce it locally with a single worker thread.

## Buggy code

```ruby
# config/initializers/sidekiq.rb
Sidekiq.configure_server do |config|
  config.server_middleware do |chain|
    chain.add TenantMiddleware
  end
end

# app/middleware/tenant_middleware.rb
class TenantMiddleware
  def call(worker, job, queue)
    account_id = job["account_id"]
    Current.account_id = account_id
    yield
  end
end

# app/workers/report_worker.rb
class ReportWorker
  include Sidekiq::Worker

  def perform(account_id)
    # Current.account_id is expected to be set by middleware
    records = Record.where(account_id: Current.account_id).all
    ReportMailer.send_report(records).deliver_now
  end
end
```
