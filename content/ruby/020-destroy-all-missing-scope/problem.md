---
slug: destroy-all-missing-scope
track: ruby
orderIndex: 20
title: destroy_all Deletes All Records
difficulty: medium
tags:
  - active-record
  - rails
  - idioms
language: ruby
---

## Context

The background job in `app/jobs/session_cleanup_job.rb` is scheduled to run hourly via `whenever` or a cron entry. Its purpose is to purge expired sessions belonging to a specific tenant in a multi-tenant SaaS application. Each `Session` record has a `tenant_id` column and an `expired_at` timestamp.

Operators discovered that after the job ran for the first time in production, every session across all tenants was deleted — not just expired ones for the target tenant. All logged-in users across the entire platform were suddenly signed out. The incident lasted until sessions were restored from backup.

A code review revealed that a recent refactor had changed how the tenant scope was applied, and the tests only covered the happy path with a single tenant in the test database.

## Buggy code

```ruby
class SessionCleanupJob < ApplicationJob
  queue_as :maintenance

  def perform(tenant_id)
    expired_scope = Session.where(expired_at: ..Time.current)

    # Intended: delete only expired sessions for this tenant.
    Session.where(tenant_id: tenant_id).destroy_all
    expired_scope.destroy_all
  end
end
```
