---
slug: operator-overload-equals-inconsistency
track: kotlin
orderIndex: 63
title: equals Overridden Without hashCode
difficulty: easy
tags:
  - collections
  - correctness
  - data-classes
language: kotlin
---

## Context

`SessionStore.kt` is a simple in-memory store that tracks active sessions keyed by a `SessionToken` value class. The store uses a `HashMap` for O(1) lookups. `SessionToken` is a custom class (not a `data class`) where `equals` has been overridden to compare by the token string, so that two tokens constructed from the same string are considered equal.

The store's `contains` check always returns `false` even for sessions that were just added. The issue is consistent and reproducible in unit tests. Sessions are added via `register`, then immediately looked up via `isActive`, and the result is always `false`.

The developer confirmed `equals` returns `true` when comparing two tokens with the same string. They also confirmed the `HashMap` is not being replaced between `register` and `isActive`.

## Buggy code

```kotlin
class SessionToken(val value: String) {
    override fun equals(other: Any?): Boolean {
        if (other !is SessionToken) return false
        return this.value == other.value
    }
    // hashCode not overridden
}

class SessionStore {
    private val active = HashMap<SessionToken, Long>()

    fun register(token: SessionToken, expiresAt: Long) {
        active[token] = expiresAt
    }

    fun isActive(token: SessionToken): Boolean {
        return active.containsKey(token)
    }
}
```
