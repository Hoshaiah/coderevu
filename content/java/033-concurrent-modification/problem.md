---
slug: concurrent-modification
track: java
orderIndex: 33
title: Removing from a list while iterating throws ConcurrentModificationException
difficulty: easy
tags:
  - collections
  - iteration
  - exceptions
language: java
---

## Context

This helper is supposed to drop expired session tokens from a cache. In production it intermittently throws `java.util.ConcurrentModificationException`. There is no concurrency involved — the method runs on a single thread.

## Buggy code

```java
import java.util.ArrayList;
import java.util.List;
import java.time.Instant;

public class SessionCache {
    private final List<Session> sessions = new ArrayList<>();

    public void purgeExpired(Instant now) {
        for (Session s : sessions) {
            if (s.expiresAt().isBefore(now)) {
                sessions.remove(s);
            }
        }
    }
}
```
