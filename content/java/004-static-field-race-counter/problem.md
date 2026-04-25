---
slug: static-field-race-counter
track: java
orderIndex: 4
title: Unsynchronized Static Counter Race
difficulty: medium
tags:
  - concurrency
  - correctness
  - thread-safety
language: java
---

## Context

`src/main/java/com/acme/http/RequestMetrics.java` tracks the total number of HTTP requests processed across all handler threads. The `increment()` method is called from every request-handling thread, and `get()` is called periodically by a monitoring thread that ships the count to a metrics backend. The service handles several hundred requests per second across a 16-thread pool.

The metrics dashboard shows the request counter advancing much more slowly than actual traffic, and the number occasionally appears to go backward over short windows. The discrepancy grows worse under higher load. No exceptions are thrown.

The engineering team initially suspected the monitoring thread was reading a stale snapshot due to caching, but adding `System.out.println` calls directly inside `increment()` shows that the increment itself is being lost — the count after 1000 concurrent increments is often around 900 or fewer.

## Buggy code

```java
public class RequestMetrics {
    private static long requestCount = 0;

    public static void increment() {
        requestCount++;
    }

    public static long get() {
        return requestCount;
    }

    public static void reset() {
        requestCount = 0;
    }
}
```
