---
slug: map-computeifabsent-mutating-value
track: java
orderIndex: 16
title: >-
  Returning a mutated result from computeIfAbsent causes entries to be lost
  under concurrent access
difficulty: hard
tags:
  - concurrency
  - collections
  - correctness
language: java
---

## Context

A high-throughput event pipeline groups incoming events by their `topic` key and batches them for bulk insertion. The grouping map is a `ConcurrentHashMap` and the code uses `computeIfAbsent` to initialise buckets. Under high load, some topics silently lose events — the database ends up with fewer rows than events received, and no exceptions are thrown.

The code runs with multiple threads calling `addEvent` concurrently.

## Buggy code

```java
import java.util.*;
import java.util.concurrent.*;

public class EventBatcher {

    private final ConcurrentHashMap<String, List<Event>> buckets =
            new ConcurrentHashMap<>();

    public void addEvent(String topic, Event event) {
        buckets.computeIfAbsent(topic, k -> new ArrayList<>())
               .add(event);
    }

    public Map<String, List<Event>> drainAll() {
        Map<String, List<Event>> snapshot = new HashMap<>(buckets);
        buckets.clear();
        return snapshot;
    }
}
```
