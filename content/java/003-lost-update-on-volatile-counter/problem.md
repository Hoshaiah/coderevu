---
slug: lost-update-on-volatile-counter
track: java
orderIndex: 3
title: Volatile Field Lost Update
difficulty: medium
tags:
  - concurrency
  - threading
  - correctness
language: java
---

## Context

This code lives in `src/main/java/com/example/metrics/RequestCounter.java`, a lightweight hit counter used to track the number of HTTP requests handled by a servlet. The counter is incremented by multiple request-handling threads and periodically read by a reporting thread that publishes metrics to a dashboard every 60 seconds.

The dashboard shows request counts that are consistently lower than the actual traffic inferred from access logs — sometimes by 10-20% under high load. The discrepancy grows with the number of concurrent threads. No exception is ever thrown. The team added `volatile` thinking it would make the counter thread-safe, based on the reasoning that `volatile` ensures visibility.

## Buggy code

```java
public class RequestCounter {
    private volatile long count = 0;

    public void increment() {
        count++;
    }

    public long getCount() {
        return count;
    }

    public void reset() {
        count = 0;
    }
}
```
