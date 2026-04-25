---
slug: deferred-await-wrong-scope
track: kotlin
orderIndex: 3
title: Deferred Await Outside Parent Scope
difficulty: easy
tags:
  - coroutines
  - structured-concurrency
  - cancellation
language: kotlin
---

## Context

This code lives in `NetworkRepository.kt`, a data-layer class used by a ViewModel to kick off two parallel API calls and combine their results. The pattern was copied from an internal wiki page that showed how to use `async` for parallelism.

In production, the app occasionally crashes with `JobCancellationException: Job was cancelled` during screen transitions. The crash appears in Crashlytics pointing to the `await()` call. Developers noticed it only happens when users navigate away quickly after entering a screen.

The team already ruled out network timeouts (the timeout is 30 s and the crash happens in under 1 s). They also confirmed neither API endpoint returns an error in the failing sessions.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class NetworkRepository(private val api: ApiService) {

    private val repoScope = CoroutineScope(Dispatchers.IO)

    suspend fun fetchDashboardData(): DashboardData {
        val userDeferred = repoScope.async { api.getUser() }
        val statsDeferred = repoScope.async { api.getStats() }

        return DashboardData(
            user = userDeferred.await(),
            stats = statsDeferred.await()
        )
    }
}
```
