---
slug: concurrent-hashmap-check-then-act-race
track: java
orderIndex: 32
title: Race Between containsKey and put
difficulty: hard
tags:
  - concurrency
  - collections
  - correctness
language: java
---

## Context

This class is in `src/main/java/com/example/auth/TokenRegistry.java`. It tracks single-use authentication tokens. Once a token is consumed it is marked as used. If a token is already used, the request must be rejected (replay attack prevention). Several request handler threads call `consume()` concurrently.

## Buggy code

```java
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;

public class TokenRegistry {
    // Key = token, Value = unused marker
    private final ConcurrentHashMap<String, Boolean> usedTokens = new ConcurrentHashMap<>();

    public boolean consume(String token) {
        if (usedTokens.containsKey(token)) {
            return false; // already used
        }
        usedTokens.put(token, Boolean.TRUE);
        return true; // consumed successfully
    }

    public int usedCount() {
        return usedTokens.size();
    }
}
```
