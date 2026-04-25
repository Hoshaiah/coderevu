---
slug: hashmap-concurrent-infinite-loop
track: java
orderIndex: 17
title: Concurrent HashMap Resize Infinite Loop
difficulty: hard
tags:
  - concurrency
  - collections
  - threading
language: java
---

## Context

This code lives in `src/main/java/com/example/cache/RequestCache.java`, a shared in-memory cache used by multiple request-handling threads in a high-throughput REST service. The cache maps request IDs to response payloads and is initialized once at startup. It is accessed from a fixed thread pool of 16 workers.

In production, under peak load, the service occasionally hangs completely. CPU spikes to 100% on one or more cores and never recovers. The only way to restore service is a full JVM restart. No exception is logged — threads just stop making progress.

A thread dump taken during the hang shows dozens of threads stuck in `HashMap.get()` or `HashMap.put()` inside an apparent infinite loop. The team initially suspected a deadlock but ruled that out because no threads are in BLOCKED state — they are all RUNNABLE, spinning.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;

public class RequestCache {
    // Shared across all request-handling threads
    private final Map<String, String> cache = new HashMap<>();

    public String get(String requestId) {
        return cache.get(requestId);
    }

    public void put(String requestId, String response) {
        cache.put(requestId, response);
    }

    public void evict(String requestId) {
        cache.remove(requestId);
    }

    public int size() {
        return cache.size();
    }
}
```
