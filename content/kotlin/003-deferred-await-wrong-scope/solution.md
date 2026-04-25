## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Deferred Await Outside Parent Scope
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class NetworkRepository(private val api: ApiService) {

    // CHANGE 2: Removed the standalone `repoScope = CoroutineScope(Dispatchers.IO)` that had no lifecycle owner and was never cancelled, causing leaks.

    suspend fun fetchDashboardData(): DashboardData {
        // CHANGE 1 & 3: Wrap parallel work in `coroutineScope {}` so the two async blocks are children of the CALLER'S job, not an independent scope; cancellation propagates correctly in both directions and an exception in either child cancels the other.
        return coroutineScope {
            val userDeferred = async(Dispatchers.IO) { api.getUser() }
            val statsDeferred = async(Dispatchers.IO) { api.getStats() }

            DashboardData(
                user = userDeferred.await(),
                stats = statsDeferred.await()
            )
        }
    }
}
```

## Explanation

### Issue 1: Deferred Awaited Outside Caller's Job Hierarchy

**Problem:** When the user navigates away, the ViewModel's coroutine scope is cancelled. The `suspend fun fetchDashboardData()` is running inside that cancelled scope, so the calling coroutine's `Job` is cancelled. But the two `async` blocks were launched on the independent `repoScope`, not as children of the caller. When `await()` is reached on the already-cancelled calling coroutine, Kotlin throws `JobCancellationException`.

**Fix:** Replace `repoScope.async { }` with `async(Dispatchers.IO) { }` called inside a `coroutineScope { }` block (CHANGE 1 & 3). `coroutineScope` creates a child scope whose `Job` is a child of the caller's `Job`, so cancellation flows naturally.

**Explanation:** Every coroutine has a parent `Job`. When you launch on `repoScope`, the parent is `repoScope`'s job — completely unrelated to the ViewModel's scope. The `await()` call suspends the calling coroutine; if that coroutine is cancelled while suspended, `await()` throws. Wrapping the `async` calls in `coroutineScope { }` makes the deferred jobs children of the caller's job. Now if the caller is cancelled, both child coroutines are also cancelled before `await()` is reached, so the exception propagates cleanly up instead of appearing to come from `await()` at a random point. A related pitfall: if you use `supervisorScope` instead of `coroutineScope` here, an exception in `getUser()` would NOT cancel `getStats()`, and you'd swallow exceptions silently — `coroutineScope` is the right choice when you want structured failure.

---

### Issue 2: Unmanaged Repository-Level `CoroutineScope` Causes Leaks

**Problem:** `repoScope = CoroutineScope(Dispatchers.IO)` creates a scope with no owner and no cancel call anywhere. Every coroutine launched on it keeps running after the screen is gone, holding references to the `ApiService`, the repository itself, and any closures captured — those objects cannot be garbage-collected.

**Fix:** Remove `repoScope` entirely (CHANGE 2). All parallel work now runs inside `coroutineScope { }` tied to the caller's lifetime, so no separate scope is needed in the repository.

**Explanation:** A `CoroutineScope` is just a wrapper around a `Job` plus a `CoroutineContext`. If you never call `repoScope.cancel()`, that `Job` lives forever in the process. Each `async` or `launch` on it adds a child `Job` that holds a reference back to the scope. In an Android app the ViewModel's `viewModelScope` (or a `lifecycleScope`) is the appropriate lifecycle-aware owner; the repository should be a pure suspend-function provider. When the repository's work is expressed as a suspend function using `coroutineScope { }`, the caller controls the lifetime and no field-level scope is necessary.

---

### Issue 3: Independent Scope Breaks Structured Concurrency Error Propagation

**Problem:** If `api.getUser()` throws, the exception is stored in `userDeferred` but `repoScope` is a `SupervisorJob`-style independent scope by default — actually `CoroutineScope(Dispatchers.IO)` uses a regular `Job`, but because the async blocks are not children of the calling coroutine, the exception does not cancel `statsDeferred`. The second network call finishes unnecessarily and its result is discarded.

**Fix:** Using `coroutineScope { }` (CHANGE 1 & 3) makes both `async` blocks children of the same structured scope. If `userDeferred` fails, the scope cancels `statsDeferred` immediately and the exception is re-thrown at the `coroutineScope` boundary.

**Explanation:** Structured concurrency guarantees that when one child fails inside a `coroutineScope`, the scope cancels all other children and then throws. With `repoScope.async { }`, both calls run to completion even after one fails, wasting network bandwidth and CPU. More importantly, `userDeferred.await()` re-throws the stored exception at the call site, but `statsDeferred` has already been left running with nothing to collect its result or its own potential exception. Moving to `coroutineScope { }` ensures the happy path and the error path are both clean: success combines both results, failure cancels both immediately and surfaces a single exception to the caller.
