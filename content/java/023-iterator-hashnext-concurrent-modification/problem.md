---
slug: iterator-hashnext-concurrent-modification
track: java
orderIndex: 23
title: HashMap Resize During Iterator Causes Infinite Loop
difficulty: hard
tags:
  - concurrency
  - collections
  - exceptions
language: java
---

## Context

This code is in `src/main/java/com/example/metrics/MetricAggregator.java`, a background thread that reads from a shared `HashMap<String, Long>` of per-metric counters. A separate writer thread increments counters. Neither thread holds a lock — the developer assumed that reads are safe as long as writes happen "rarely".

In load testing, the application occasionally hangs indefinitely. Thread dumps show the aggregator thread spinning inside `HashMap.get()` or `HashMap.getEntry()` with 100% CPU, never returning. The JVM must be killed to recover. This does not happen in unit tests because those are single-threaded.

The team ruled out an application-level deadlock (no monitors are contested in the thread dump). The spinning thread holds no lock and is not waiting — it is actively executing inside the HashMap internals.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;

public class MetricAggregator implements Runnable {
    // Shared with writer threads — no synchronization
    private final Map<String, Long> counters = new HashMap<>();

    // Called by writer threads
    public void increment(String metric) {
        counters.merge(metric, 1L, Long::sum);
    }

    // Runs on its own background thread
    @Override
    public void run() {
        while (true) {
            long total = 0;
            for (Map.Entry<String, Long> entry : counters.entrySet()) {
                total += entry.getValue();
            }
            System.out.println("Total: " + total);
            try { Thread.sleep(5000); } catch (InterruptedException e) { break; }
        }
    }
}
```
