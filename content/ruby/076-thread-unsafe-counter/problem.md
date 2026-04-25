---
slug: thread-unsafe-counter
track: ruby
orderIndex: 76
title: Request counter is under-counted under concurrent load
difficulty: medium
tags:
  - concurrency
  - thread-safety
  - race-condition
language: ruby
---

## Context

A Puma-backed API server tracks the total number of requests processed since boot. Operations reports that the counter drifts lower than the actual request count when traffic spikes — sometimes by thousands per minute. The counter is printed to a `/metrics` endpoint consumed by Prometheus.

## Buggy code

```ruby
class RequestCounter
  @@count = 0

  def self.increment
    @@count += 1
  end

  def self.value
    @@count
  end
end

# Called from Rack middleware on every request:
def call(env)
  RequestCounter.increment
  @app.call(env)
end
```
