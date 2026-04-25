---
slug: scope-default-proc-captured-at-load
track: ruby
orderIndex: 39
title: Default Scope Time Frozen at Boot
difficulty: hard
tags:
  - active-record
  - rails
  - idioms
language: ruby
---

## Context

`app/models/audit_log.rb` defines a default scope to show only audit logs from the last 90 days, so that queries across the application don't accidentally load years of historical data. The scope was added as a performance guardrail after a production incident where a full table scan caused an outage.

The operations team noticed that after the application has been running for several weeks, the 'last 90 days' filter starts silently including data older than 90 days. The cutoff date appears to be frozen at the date the application server was last booted. Restarting the server resets the cutoff to today minus 90 days, confirming the window shifts with restarts rather than with real time.

This causes the performance guardrail to gradually erode as the application runs, ultimately allowing the same full-table-scan queries the scope was introduced to prevent.

## Buggy code

```ruby
class AuditLog < ApplicationRecord
  # Restrict queries to the last 90 days to avoid accidental full table scans.
  default_scope { where('created_at >= ?', 90.days.ago) }

  belongs_to :user
  belongs_to :resource, polymorphic: true
end

# Called from many places:
# AuditLog.where(user: current_user)   # expects last-90-days filter
# AuditLog.count                        # likewise
```
