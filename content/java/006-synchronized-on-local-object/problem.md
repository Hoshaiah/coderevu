---
slug: synchronized-on-local-object
track: java
orderIndex: 6
title: Synchronized Block on Local Variable
difficulty: medium
tags:
  - concurrency
  - correctness
  - exceptions
language: java
---

## Context

This counter lives in `src/main/java/com/example/metrics/RequestCounter.java`. Multiple request-handling threads call `increment()` concurrently to track how many requests each endpoint has served. The counters are read periodically by a metrics exporter to push data to a dashboard.

The dashboard shows wildly inconsistent counts — totals that are lower than expected, and occasionally the count resets to a previous value mid-monitoring window. The team added the `synchronized` block specifically to prevent races, so they are confused about why the behavior is not thread-safe.

Threading analysis confirmed that all threads share the same `RequestCounter` instance. Adding verbose logging shows that some increments simply disappear — the counter value after a batch of increments is lower than the number of calls made.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;

public class RequestCounter {

    private final Map<String, Integer> counts = new HashMap<>();

    public void increment(String endpoint) {
        Object lock = new Object();
        synchronized (lock) {
            counts.merge(endpoint, 1, Integer::sum);
        }
    }

    public Map<String, Integer> snapshot() {
        Object lock = new Object();
        synchronized (lock) {
            return new HashMap<>(counts);
        }
    }
}
```
