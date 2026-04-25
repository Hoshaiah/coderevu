---
slug: hashmap-size-check-before-put-race
track: java
orderIndex: 12
title: HashMap Size Check Before Put Race
difficulty: medium
tags:
  - concurrency
  - collections
  - hashmap
language: java
---

## Context

This class lives in `src/main/java/com/example/cache/BoundedCache.java` and acts as a simple in-memory bounded cache for expensive database lookups. It is shared across request-handling threads in a Tomcat servlet container. The intent is to prevent the map from growing beyond a configurable `maxSize` limit.

In production the cache consistently exceeds its declared limit under load. When monitoring reports the cache size, it can be two or three times `maxSize`. Heap pressure eventually triggers frequent GC pauses and the service SLA is missed.

The team already added `synchronized` to `get`, suspecting that was the entry point, but the overflow persists. Adding logging showed that `put` is reached by multiple threads simultaneously with `size() < maxSize` all evaluating to `true` before any of them completes the insertion.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;

public class BoundedCache<K, V> {
    private final Map<K, V> store = new HashMap<>();
    private final int maxSize;

    public BoundedCache(int maxSize) {
        this.maxSize = maxSize;
    }

    public synchronized V get(K key) {
        return store.get(key);
    }

    public void put(K key, V value) {
        if (store.size() < maxSize) {
            store.put(key, value);
        }
    }

    public int size() {
        return store.size();
    }
}
```
