## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — async Exception Lost Without Await
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class DataSyncService(private val scope: CoroutineScope) {
    suspend fun sync() {
        val prefsDeferred = scope.async { fetchPreferences() }
        val analyticsDeferred = scope.async { fetchAnalytics() }

        val prefs = prefsDeferred.await()
        // CHANGE 1: await analyticsDeferred so that any exception it carries is rethrown here and propagates to the CoroutineExceptionHandler; without this call the Deferred holds the exception indefinitely and nothing ever observes it.
        val analytics = analyticsDeferred.await()
        // CHANGE 2: only write the cache after both results are successfully obtained, preventing partial/stale data from being written when analytics fails.
        writeCache(prefs, analytics)
    }

    private suspend fun fetchPreferences(): UserPrefs = TODO()
    private suspend fun fetchAnalytics(): AnalyticsSummary = TODO()
    // CHANGE 2: writeCache now accepts both prefs and analytics so the full result set is persisted atomically.
    private fun writeCache(prefs: UserPrefs, analytics: AnalyticsSummary) {}
}

data class UserPrefs(val theme: String)
data class AnalyticsSummary(val views: Int)
```

## Explanation

### Issue 1: Analytics exception never observed

**Problem:** When `fetchAnalytics()` throws (e.g., on a 500 response), the exception is stored inside the `analyticsDeferred` object. Because `analyticsDeferred.await()` is never called, nothing ever reads that exception out of the `Deferred`. The `CoroutineExceptionHandler` on the parent scope is never triggered, Crashlytics sees nothing, and `sync()` returns normally.

**Fix:** Add `val analytics = analyticsDeferred.await()` immediately after `prefsDeferred.await()`. This is the `CHANGE 1` site. Calling `await()` on a failed `Deferred` rethrows the stored exception at the call site, letting it propagate up through the coroutine hierarchy to the installed `CoroutineExceptionHandler`.

**Explanation:** A Kotlin `Deferred` is a `Job` that carries either a result or an exception. The exception is only surfaced when you call `await()` — it does not automatically propagate the moment `fetchAnalytics()` throws. If you never call `await()`, the `Deferred` is eventually garbage-collected with its exception unobserved. Note that this differs from structured concurrency: if `analyticsDeferred` were launched as a *child* of the current coroutine (using `coroutineScope { async { } }` instead of `scope.async { }`), cancellation and exceptions would propagate automatically. Because `scope.async` launches on the external scope as a sibling, the caller owns the responsibility of observing the result via `await()`. A related pitfall: if `prefsDeferred.await()` throws first, execution skips `analyticsDeferred.await()` entirely — wrapping both in a `try/finally` or using `coroutineScope` is safer for production code.

---

### Issue 2: Cache written before analytics result is confirmed

**Problem:** `writeCache(prefs)` is called as soon as preferences are fetched, regardless of whether analytics succeeded. This means the cache can be updated with preferences-only data every time analytics fails, leaving analytics dashboards showing stale values even if the preferences half of the sync was healthy.

**Fix:** Change `writeCache` to accept both `prefs: UserPrefs` and `analytics: AnalyticsSummary`, and call it only after both `await()` calls succeed (`CHANGE 2`). This makes the cache write an atomic all-or-nothing operation across both data sources.

**Explanation:** The original code writes the cache mid-function, after only one of two async operations completes. Any code that reads the cache afterward sees a mix of freshly-fetched preferences and whatever analytics value was stored from the previous successful sync. By deferring `writeCache` until both `Deferred` values are in hand, you guarantee the cache is either fully updated or not updated at all for this sync cycle. This is the same principle as a database transaction: partial writes produce inconsistent state that is hard to detect and hard to recover from.
