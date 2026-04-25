---
slug: linkedhashmap-access-order-concurrent-read
track: java
orderIndex: 30
title: LinkedHashMap Access-Order Concurrent Read
difficulty: hard
tags:
  - concurrency
  - collections
  - hashmap
language: java
---

## Context

This class lives in `src/main/java/com/example/cache/LruCache.java` and implements a simple LRU eviction cache using `LinkedHashMap` in access-order mode. It is exposed as a shared singleton across multiple threads in a Spring service. The implementation intentionally overrides `removeEldestEntry` for bounded eviction.

In production the service intermittently suffers from infinite loops and corrupted iteration, causing threads to hang indefinitely inside `get`. Heap dumps reveal that the internal doubly-linked list of the `LinkedHashMap` has cyclic references, which causes `get` to spin forever traversing a cycle in the linked structure.

The team already confirmed there is no concurrent write from two threads simultaneously calling `put`. The corruption is reproducible when one thread calls `put` (which may reorder the linked list for LRU tracking) while another thread is simultaneously calling `get` (which also reorders the linked list in access-order mode). Read operations were assumed to be safe to run concurrently.

## Buggy code

```java
import java.util.LinkedHashMap;
import java.util.Map;

public class LruCache<K, V> {
    private final Map<K, V> cache;

    public LruCache(int maxSize) {
        this.cache = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                return size() > maxSize;
            }
        };
    }

    public synchronized void put(K key, V value) {
        cache.put(key, value);
    }

    public V get(K key) {
        return cache.get(key);
    }

    public int size() {
        return cache.size();
    }
}
```
