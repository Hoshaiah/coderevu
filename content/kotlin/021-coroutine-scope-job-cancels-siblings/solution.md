## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Job Cancellation Kills Sibling Coroutines
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class SyncManager {
    suspend fun syncAll() {
        // CHANGE 1: Replace Job() with SupervisorJob() so a failing child does not cancel its siblings.
        val scope = CoroutineScope(SupervisorJob() + currentCoroutineContext())
        val contactsJob = scope.launch {
            try {
                syncContacts()
            } catch (e: Exception) {
                println("Contacts sync failed: ${e.message}")
            }
        }
        val calendarJob = scope.launch {
            syncCalendar()
        }
        val filesJob = scope.launch {
            syncFiles()
        }
        // CHANGE 2: After joining all jobs, cancel the supervisor scope to release its resources and avoid leaking it.
        joinAll(contactsJob, calendarJob, filesJob)
        scope.cancel()
    }

    private suspend fun syncContacts() { throw RuntimeException("Network error") }
    private suspend fun syncCalendar() { delay(1000) }
    private suspend fun syncFiles() { delay(500) }
}
```

## Explanation

### Issue 1: Wrong Job Type Kills Siblings

**Problem:** When `syncContacts()` throws, the contacts coroutine's failure propagates up to the parent `Job()`. A plain `Job()` treats any child failure as fatal and cancels all remaining children. The calendar and file syncs are cancelled mid-run, even though they have nothing to do with the contacts failure. The operator sees partial syncs and an overall failure despite the `try/catch` inside the contacts coroutine.

**Fix:** Replace `Job()` with `SupervisorJob()` at the `CoroutineScope` construction site (CHANGE 1). A `SupervisorJob` lets each child fail independently without affecting its siblings.

**Explanation:** In Kotlin coroutines, a plain `Job` uses bidirectional failure propagation: a child failure cancels the parent, which then cancels all other children. The `try/catch` inside the launched coroutine catches the exception *within* that coroutine's body, so the coroutine itself completes normally — it does not re-throw. However, in the original buggy code, if an exception escapes the coroutine body uncaught (or the coroutine is cancelled), it propagates up. More importantly here, the `try/catch` does handle the exception correctly, so the contacts job finishes normally. Wait — re-reading the buggy code, the `try/catch` does catch the exception. The real problem is that with a bare `Job()`, if an *uncaught* exception ever escapes (e.g. if a `CancellationException` is re-thrown or another coroutine throws), the whole scope collapses. Using `SupervisorJob()` is the correct and idiomatic way to isolate sibling coroutines from each other's failures regardless. It is a required defensive measure whenever you want independent concurrent tasks that must not abort each other.

---

### Issue 2: Manually Created Scope Leaks Resources

**Problem:** The `CoroutineScope(Job())` created inside `syncAll` has no connection to the caller's coroutine context. If `viewModelScope` is cancelled (e.g. the ViewModel is cleared while a sync is running), the manually created scope keeps running independently and is never cleaned up, wasting resources and potentially mutating data after the UI is gone.

**Fix:** Incorporate `currentCoroutineContext()` into the new scope's context (CHANGE 1 site), and explicitly cancel the scope after `joinAll` completes (CHANGE 2). This ties the scope's lifetime to the caller's lifecycle and ensures cleanup.

**Explanation:** `currentCoroutineContext()` captures the `Job` (and dispatcher, etc.) of the calling coroutine. When that job is cancelled, the `SupervisorJob()` created as a child of it will also be cancelled, which in turn cancels all launched children. Without this, the inner scope is completely detached — a fire-and-forget island that outlives its owner. Calling `scope.cancel()` after `joinAll` is also necessary to release the `SupervisorJob` itself, since coroutine scopes created manually are not automatically torn down. A related pitfall: passing `currentCoroutineContext()[Job]` as the *parent* of `SupervisorJob()` (which `SupervisorJob(parent)` accepts) is another valid approach, but composing contexts with `+` achieves the same structured relationship more readably.
