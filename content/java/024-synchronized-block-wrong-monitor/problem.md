---
slug: synchronized-block-wrong-monitor
track: java
orderIndex: 24
title: Synchronizing on Reassignable Field Monitor
difficulty: hard
tags:
  - concurrency
  - nulls
  - exceptions
language: java
---

## Context

This file is `src/main/java/com/example/cache/BoundedCache.java`. It is a simple bounded in-memory cache used by a high-traffic REST service. Multiple request-handling threads call `get` and `put` concurrently. The developer added `synchronized` blocks to protect the shared map.

In production, occasional `ConcurrentModificationException` traces appear in logs pointing to the iterator inside `evict()`. More rarely, two threads both successfully put different values for the same key within milliseconds of each other (observed by comparing audit log timestamps). The bugs are intermittent and not reproducible in single-threaded tests.

Code review noted the `synchronized` blocks but did not catch the underlying issue. A colleague suggested the map itself might not be thread-safe, but replacing it with `ConcurrentHashMap` did not stop the exceptions.

## Buggy code

```java
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class BoundedCache {
    private Map<String, String> store = new HashMap<>();
    private final int maxSize;

    public BoundedCache(int maxSize) {
        this.maxSize = maxSize;
    }

    public String get(String key) {
        synchronized (store) {
            return store.get(key);
        }
    }

    public void put(String key, String value) {
        synchronized (store) {
            if (store.size() >= maxSize) {
                evict();
            }
            store.put(key, value);
        }
    }

    private void evict() {
        Iterator<String> it = store.keySet().iterator();
        if (it.hasNext()) {
            it.next();
            it.remove();
        }
    }

    public void rehash() {
        // Called occasionally to replace the map with a fresh one
        store = new HashMap<>(store);
    }
}
```
