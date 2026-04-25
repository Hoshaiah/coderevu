---
slug: arraylist-initial-capacity-confusion
track: java
orderIndex: 43
title: ArrayList Constructor Misused for Copies
difficulty: easy
tags:
  - collections
  - nulls
  - correctness
language: java
---

## Context

This utility method is in `src/main/java/com/example/analytics/EventBatch.java`. It creates a defensive copy of an event list before handing it to a downstream processor that may mutate the list. It was written quickly during a refactor and reviewed without being run against the case where `events` is non-empty.

## Buggy code

```java
import java.util.ArrayList;
import java.util.List;

public class EventBatch {
    private final List<String> events;

    public EventBatch(List<String> events) {
        this.events = events;
    }

    public List<String> defensiveCopy() {
        return new ArrayList<>(events.size());
    }

    public int size() {
        return events.size();
    }
}
```
