---
slug: collections-frequency-wrong-equals
track: java
orderIndex: 53
title: Collections.frequency Uses Wrong equals
difficulty: hard
tags:
  - collections
  - nulls
  - correctness
language: java
---

## Context

This code lives in `src/main/java/com/example/audit/AuditChecker.java`. It receives a list of `AuditEvent` objects deserialized from JSON and checks how many times a specific event has appeared in the current batch. The `AuditEvent` class was written by another team and its source is not directly modifiable.

The checker always returns zero for every query, even when the list visibly contains matching events when printed. The bug appears consistently across all environments. The team has verified the list is non-empty, the target event's fields match events in the list, and `equals` is not overridden on `AuditEvent`.

A junior developer added a `System.out.println` showing `list.contains(target)` also returns `false` for a target object that was literally constructed with identical field values. This is the clue the team is stuck on.

## Buggy code

```java
import java.util.Collections;
import java.util.List;
import java.util.Objects;

public class AuditChecker {

    public static class AuditEvent {
        public final String userId;
        public final String action;

        public AuditEvent(String userId, String action) {
            this.userId = userId;
            this.action = action;
        }

        @Override
        public String toString() {
            return userId + ":" + action;
        }
        // equals and hashCode intentionally not overridden
    }

    public int countOccurrences(List<AuditEvent> events, String userId, String action) {
        AuditEvent target = new AuditEvent(userId, action);
        return Collections.frequency(events, target);
    }
}
```
