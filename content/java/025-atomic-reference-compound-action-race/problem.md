---
slug: atomic-reference-compound-action-race
track: java
orderIndex: 25
title: Non-Atomic Check-Then-Act on AtomicReference
difficulty: hard
tags:
  - concurrency
  - collections
  - race-condition
language: java
---

## Context

This class is in `src/main/java/com/acme/features/FeatureFlagCache.java`. A background refresher thread replaces the entire flag map atomically using an `AtomicReference`, while request-handling threads read individual flags. The intent was to allow lock-free reads with snapshot-consistent updates.

Under high concurrency (load tests at ~5000 RPS), the application occasionally fails to respect newly activated feature flags — a flag is enabled in the config store, the refresher logs that it has updated the reference, but some requests continue to see the old value for several seconds. More rarely, a flag that was present in both the old and new map appears to vanish for one or two requests.

The team already verified that the refresher does correctly build a new immutable map and call `flagsRef.set(newMap)`. The problem is on the read side.

## Buggy code

```java
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

public class FeatureFlagCache {
    private final AtomicReference<Map<String, Boolean>> flagsRef =
        new AtomicReference<>(Map.of());

    public void refresh(Map<String, Boolean> newFlags) {
        flagsRef.set(Map.copyOf(newFlags));
    }

    public boolean isEnabled(String flag) {
        if (flagsRef.get() == null) {
            return false;
        }
        return flagsRef.get().getOrDefault(flag, false);
    }
}
```
