---
slug: data-class-equals-mutable-set
track: kotlin
orderIndex: 77
title: Mutable Set in Data Class Key
difficulty: medium
tags:
  - collections
  - nullability
  - correctness
language: kotlin
---

## Context

This code lives in `com/example/cache/PermissionCache.kt`. A `PermissionSet` data class is used as a map key to cache authorization results for combinations of permissions. The cache is populated at login time and queried on every protected API call.

In production, authorization checks that should hit the cache always miss, causing redundant database lookups on every request. Profiling shows the cache map always returns `null` even for keys that were definitely inserted moments before. No mutations to the `MutableSet` are happening between insert and lookup — the developer verified this with logging.

The developer has already checked that the `PermissionSet` instances being used as keys are created with equal contents and confirmed the `equals` check returns `true` at the point of insertion.

## Buggy code

```kotlin
data class PermissionSet(val permissions: MutableSet<String>)

class PermissionCache {
    private val cache = HashMap<PermissionSet, Boolean>()

    fun put(permissions: MutableSet<String>, result: Boolean) {
        val key = PermissionSet(permissions)
        cache[key] = result
    }

    fun get(permissions: MutableSet<String>): Boolean? {
        val key = PermissionSet(permissions)
        return cache[key]
    }

    fun invalidate(permissions: MutableSet<String>) {
        val key = PermissionSet(permissions)
        permissions.add("__invalidate__")
        cache.remove(key)
    }
}
```
