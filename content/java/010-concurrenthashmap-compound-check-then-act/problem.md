---
slug: concurrenthashmap-compound-check-then-act
track: java
orderIndex: 10
title: ConcurrentHashMap Check-Then-Act Race
difficulty: medium
tags:
  - concurrency
  - collections
  - race-condition
language: java
---

## Context

`RateLimiter.java` sits in the API gateway layer and enforces a per-client request cap. It is called from a thread pool with up to 64 worker threads, one invocation per incoming HTTP request. The backing map tracks how many requests each client ID has made within the current window.

Under load testing at ~2000 req/s, clients occasionally slip through with more requests than the configured limit. The excess is small — usually 1-3 over the cap — but it's enough to violate SLA commitments. Adding logging around the check showed the count looked correct just before returning `true`, yet more requests were allowed than expected.

The team already verified that the `AtomicInteger` increments are individually atomic, so they ruled out lost increments as the cause.

## Buggy code

```java
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class RateLimiter {
    private final int maxRequests;
    private final ConcurrentHashMap<String, AtomicInteger> counts =
            new ConcurrentHashMap<>();

    public RateLimiter(int maxRequests) {
        this.maxRequests = maxRequests;
    }

    // Returns true if the request is allowed, false if rate-limited.
    public boolean allowRequest(String clientId) {
        counts.putIfAbsent(clientId, new AtomicInteger(0));
        AtomicInteger counter = counts.get(clientId);
        if (counter.get() < maxRequests) {
            counter.incrementAndGet();
            return true;
        }
        return false;
    }
}
```
