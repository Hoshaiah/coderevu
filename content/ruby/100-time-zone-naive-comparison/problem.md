---
slug: time-zone-naive-comparison
track: ruby
orderIndex: 100
title: Scheduled jobs run at the wrong time for users outside UTC
difficulty: hard
tags:
  - time-zones
  - correctness
  - rails
  - datetime
language: ruby
---

## Context

A SaaS app lets users schedule weekly digest emails for a time of their choosing. The scheduler runs every minute and queries for users whose digest is due. After launching in Europe, multiple users reported their emails arriving 1-2 hours off schedule. The bug is intermittent — it disappears in winter and reappears in summer, which is a strong hint about the root cause.

## Buggy code

```ruby
class DigestScheduler
  def self.run
    now = Time.now  # server is UTC

    due_users = User.where(
      "scheduled_hour = ? AND scheduled_minute = ? AND time_zone = ?",
      now.hour,
      now.min,
      'Europe/London'
    )

    due_users.find_each do |user|
      DigestMailer.weekly(user).deliver_later
    end
  end
end
```
