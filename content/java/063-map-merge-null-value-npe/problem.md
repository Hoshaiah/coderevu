---
slug: map-merge-null-value-npe
track: java
orderIndex: 63
title: Map.merge Throws NPE on Null Value
difficulty: easy
tags:
  - nulls
  - collections
  - api-misuse
language: java
---

## Context

This utility lives in `src/main/java/com/example/analytics/EventAggregator.java` and is responsible for counting how many times each event type has been seen in a rolling window. It is called from a Kafka consumer thread for every incoming message.

In production, the consumer occasionally dies with a `NullPointerException` deep inside `HashMap.merge`. The stack trace points to the remapping function inside `aggregateCounts`, but the team has confirmed the `eventType` argument is never null and the map is properly initialized.

The team has already ruled out concurrent access — the map is confined to a single thread. They suspect the lambda, but cannot figure out what specifically is wrong.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;

public class EventAggregator {
    private final Map<String, Integer> counts = new HashMap<>();

    public void aggregateCounts(String eventType, int delta) {
        counts.merge(eventType, delta, (oldVal, newVal) -> {
            int sum = oldVal + newVal;
            if (sum == 0) {
                return null; // remove the key when count hits zero
            }
            return sum;
        });
    }

    public int getCount(String eventType) {
        return counts.getOrDefault(eventType, 0);
    }
}
```
