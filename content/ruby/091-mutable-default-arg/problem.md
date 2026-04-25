---
slug: mutable-default-arg
track: ruby
orderIndex: 91
title: Tagged events share a hash across calls
difficulty: easy
tags:
  - mutation
  - default-arguments
language: ruby
---

## Context

`record_event` is called from a dozen places. A QA engineer noticed that logged events sometimes carry tags from *other* events that have nothing to do with them — as if history were leaking between calls.

## Buggy code

```ruby
class Analytics
  EVENTS = []

  def self.record_event(name, tags = {})
    tags[:recorded_at] = Time.now
    EVENTS << { name: name, tags: tags }
  end
end

Analytics.record_event("signup")
Analytics.record_event("checkout")
# Both events end up with the same tags hash, including each other's data
# once anything writes to `tags` after the fact.
```
