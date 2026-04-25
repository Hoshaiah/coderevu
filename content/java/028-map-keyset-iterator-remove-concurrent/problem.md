---
slug: map-keyset-iterator-remove-concurrent
track: java
orderIndex: 28
title: HashMap Resize Triggers Infinite Loop
difficulty: hard
tags:
  - concurrency
  - collections
  - race-condition
language: java
---

## Context

`MetricsAggregator.java` runs inside a long-lived background thread and accumulates per-endpoint hit counts. A separate HTTP handler thread reads from and writes to the same `HashMap` to bump counters. The class was originally written for a single-threaded environment and later had the aggregator loop added without updating the threading model.

Under sustained traffic in production (Java 8 JVM), the aggregator thread occasionally pegs a CPU core at 100% and never returns. Restarting the service is the only recovery. The issue never reproduces in integration tests, which use low concurrency.

The team already added `volatile` to the `running` flag and confirmed the loop condition is not the cause. They have not changed the `HashMap` to `ConcurrentHashMap`.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;

public class MetricsAggregator implements Runnable {
    private final Map<String, Long> counters = new HashMap<>();
    private volatile boolean running = true;

    // Called from HTTP handler threads
    public void increment(String endpoint) {
        counters.merge(endpoint, 1L, Long::sum);
    }

    // Called from HTTP handler threads
    public long getCount(String endpoint) {
        return counters.getOrDefault(endpoint, 0L);
    }

    // Runs on a dedicated background thread
    @Override
    public void run() {
        while (running) {
            try {
                Thread.sleep(60_000);
                flushToDatabase();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private void flushToDatabase() {
        for (Map.Entry<String, Long> entry : counters.entrySet()) {
            // write entry to DB, then clear it
            counters.put(entry.getKey(), 0L);
        }
    }
}
```
