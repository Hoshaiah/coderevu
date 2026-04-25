---
slug: optional-orelse-eagerly-evaluated
track: java
orderIndex: 84
title: Optional.orElse Eagerly Evaluates Fallback
difficulty: medium
tags:
  - exceptions
  - nulls
  - collections
language: java
---

## Context

This method is in `src/main/java/com/example/user/UserService.java`. It fetches a user from a primary cache; if absent, it falls back to a database call. The developer used `Optional.orElse()` to express the fallback idiom concisely. The database call is expensive (network I/O, connection pool, query latency).

Performance monitoring shows that `db.findById()` is being called for every request, even those where the cache returns a populated `Optional`. Database connection-pool exhaustion follows during traffic spikes. Metrics confirm cache hit rate is above 90%, yet database calls are at 100% of request rate.

The team verified the cache is warm and returning values correctly. They also confirmed the `Optional` returned by `cache.get()` is non-empty for cache hits. The database calls happen anyway.

## Buggy code

```java
import java.util.Optional;

public class UserService {
    private final UserCache cache;
    private final UserRepository db;

    public UserService(UserCache cache, UserRepository db) {
        this.cache = cache;
        this.db = db;
    }

    public User getUser(long userId) {
        return cache.get(userId)
                    .orElse(db.findById(userId));
    }
}
```
