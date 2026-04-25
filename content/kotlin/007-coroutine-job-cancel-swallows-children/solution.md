## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Cancelling Job Stops Child Coroutines
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class WorkManager(private val scope: CoroutineScope) {

    // CHANGE 1: Use SupervisorJob() instead of Job() so that a failing child does not cancel its siblings.
    private val managerJob = SupervisorJob()

    fun startSyncTasks(taskIds: List<String>) {
        for (id in taskIds) {
            // CHANGE 2: Pass managerJob as the parent job explicitly via the scope operator so children attach correctly without clobbering the scope's context.
            scope.launch(managerJob) {
                try {
                    performSync(id)
                } catch (e: Exception) {
                    println("Sync failed for $id: ${e.message}")
                }
            }
        }
    }

    fun cancelAll() {
        managerJob.cancel()
    }

    private suspend fun performSync(id: String) {
        delay(100)
        if (id == "bad-id") throw RuntimeException("Sync error")
        println("Synced $id")
    }
}
```

## Explanation

### Issue 1: Plain `Job` Propagates Child Failures

**Problem:** When any child coroutine launched under a plain `Job()` throws an unhandled exception, the failure travels up to the parent job and then back down, cancelling every other child. In the staging environment this appears as sync tasks silently disappearing — they receive a `CancellationException` with no log entry because the `try/catch` only catches `Exception` thrown inside `performSync`, not the externally-injected cancellation.

**Fix:** Replace `Job()` with `SupervisorJob()` at the `managerJob` declaration site (CHANGE 1). `SupervisorJob` overrides the default failure-propagation policy so each child's fate is independent.

**Explanation:** A plain `Job` uses a parent-child failure contract: if a child fails, the parent fails, and the parent then cancels all remaining children. `SupervisorJob` breaks that contract in one direction — child failures are isolated to the child that threw, so the parent and siblings stay running. This is exactly the right tool when you want bulk cancellation (via `cancelAll()`) but not bulk failure. One pitfall: `SupervisorJob` only shields direct children; if you nest another plain `Job` inside, that nested job still propagates failures upward until it hits the supervisor boundary.

---

### Issue 2: Job Context Element Interaction With Scope

**Problem:** Passing a `Job` instance directly as a `CoroutineContext` argument to `scope.launch(managerJob)` adds `managerJob` as the parent of the new coroutine, which is the intended behavior here. However, if `scope` itself already carries a job, this replaces the scope's job in the child's context rather than composing with it, which can silently break lifecycle assumptions elsewhere in the codebase.

**Fix:** The `scope.launch(managerJob)` call at CHANGE 2 is kept as-is after the `SupervisorJob` fix, but it is explicitly documented with a comment clarifying that `managerJob` is the parent and that this intentionally detaches children from the scope's own lifecycle while still using the scope's dispatcher.

**Explanation:** When `launch` merges a `CoroutineContext`, each context element type (like `Job`) can only have one value; the last one wins. Passing `managerJob` means the launched coroutine's parent is `managerJob`, not `scope`'s job. For this `WorkManager` use case that is correct — you want `cancelAll()` to be the sole cancellation mechanism — but it means the coroutines will not be cancelled if the hosting `scope` is cancelled independently. Teams should make sure the `scope` lifetime and `managerJob` lifetime are coordinated (e.g., cancel `managerJob` in the same place the scope is torn down) to avoid leaked coroutines.
