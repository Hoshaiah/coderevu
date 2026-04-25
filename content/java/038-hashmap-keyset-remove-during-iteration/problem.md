---
slug: hashmap-keyset-remove-during-iteration
track: java
orderIndex: 38
title: Map KeySet Modified During Iteration
difficulty: easy
tags:
  - collections
  - concurrency
  - iteration
language: java
---

## Context

This class is in `src/main/java/com/acme/cache/TtlCache.java`, a simple time-to-live cache used by the product catalog service. A scheduled cleanup thread calls `evictExpired()` every minute to remove stale entries and keep memory usage bounded.

In production the cleanup job occasionally crashes with `java.util.ConcurrentModificationException` in the eviction loop, causing the scheduled task to silently stop running (Spring `@Scheduled` swallows the exception). After the task dies, memory grows unbounded until the next deployment.

The developer confirmed there is only one thread calling `evictExpired()` at a time — the `@Scheduled` annotation uses a single-threaded scheduler. Concurrent reads from other threads are happening, but the developer believes that shouldn't matter since reads don't structurally modify the map.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;
import java.time.Instant;

public class TtlCache<K, V> {
    private final Map<K, CacheEntry<V>> store = new HashMap<>();

    public void put(K key, V value, Instant expiresAt) {
        store.put(key, new CacheEntry<>(value, expiresAt));
    }

    public V get(K key) {
        CacheEntry<V> entry = store.get(key);
        return (entry != null) ? entry.value : null;
    }

    public void evictExpired(Instant now) {
        for (K key : store.keySet()) {
            if (store.get(key).expiresAt.isBefore(now)) {
                store.remove(key);
            }
        }
    }

    private static class CacheEntry<V> {
        final V value;
        final Instant expiresAt;
        CacheEntry(V value, Instant expiresAt) {
            this.value = value;
            this.expiresAt = expiresAt;
        }
    }
}
```
