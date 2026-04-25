---
slug: coroutine-async-exception-ignored
track: kotlin
orderIndex: 19
title: async Exception Lost Without Await
difficulty: medium
tags:
  - coroutines
  - error-handling
  - async
language: kotlin
---

## Context

`DataSyncService.kt` runs a periodic sync that fetches user preferences and analytics summaries in parallel using `async`. The results are combined before being written to a local cache. The function is called from a background coroutine that has a top-level `CoroutineExceptionHandler` configured to log and report errors to Crashlytics.

The team observes that when the analytics API returns a 500 error and throws an exception, the error handler is never invoked and the sync appears to succeed — the cache is written with stale or partial data. Crashlytics shows no errors but customer support receives complaints about incorrect analytics dashboards.

The team verified the exception is definitely thrown by adding a log statement inside the catch block of the analytics client. The `CoroutineExceptionHandler` is correctly installed on the parent scope.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class DataSyncService(private val scope: CoroutineScope) {
    suspend fun sync() {
        val prefsDeferred = scope.async { fetchPreferences() }
        val analyticsDeferred = scope.async { fetchAnalytics() }

        // Wait for preferences; analytics result unused if fetch succeeded
        val prefs = prefsDeferred.await()
        writeCache(prefs)
    }

    private suspend fun fetchPreferences(): UserPrefs = TODO()
    private suspend fun fetchAnalytics(): AnalyticsSummary = TODO()
    private fun writeCache(prefs: UserPrefs) {}
}

data class UserPrefs(val theme: String)
data class AnalyticsSummary(val views: Int)
```
