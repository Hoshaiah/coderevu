## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — CoroutineScope Cancelled Before Children Finish
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class JobProcessor {

    suspend fun process(jobs: List<UploadJob>) {
        // CHANGE 2: Use coroutineScope {} instead of a long-lived external scope so that structured concurrency is maintained and the function waits for all children.
        coroutineScope {
            for (job in jobs) {
                // CHANGE 1: launch inside the local coroutineScope so process() suspends until every child finishes before returning.
                launch {
                    processJob(job)
                }
            }
        }
    }

    private suspend fun processJob(job: UploadJob) {
        delay(job.estimatedMs)
        job.markComplete()
    }
}

data class UploadJob(val id: Int, val estimatedMs: Long) {
    suspend fun markComplete() { /* DB update */ }
}
```

## Explanation

### Issue 1: process() Does Not Await Child Coroutines

**Problem:** `process()` launches every job coroutine and then returns immediately. From the caller's perspective the work is done, but the coroutines are still running (or haven't even started executing their first suspension point). Longer jobs vanish because the surrounding service shuts down or moves on before those coroutines resume from `delay`.

**Fix:** Replace `scope.launch {}` with `launch {}` inside a `coroutineScope {}` block. `coroutineScope` suspends the caller until every child `launch`ed inside it completes, so `process()` only returns when all jobs are finished.

**Explanation:** `scope.launch` schedules work on a pre-existing, independently-lived scope and returns a `Job` handle immediately — nothing waits on it. Because `process()` is a `suspend fun`, the idiomatic fix is `coroutineScope {}`, which creates a child scope tied to the current coroutine. It suspends the coroutine that called it until all children complete, giving you a sequential-looking API that is still concurrent internally. If you kept the old code but added `.join()` calls you would achieve the same wait semantics, but `coroutineScope` is the standard, cancellation-safe way to express "run these concurrently and wait for all of them".

---

### Issue 2: Long-Lived External Scope Breaks Structured Concurrency

**Problem:** The class-level `scope` property outlives any single `process()` call. Coroutines launched on it are not logically tied to the operation that started them, so they cannot be cancelled if `process()` itself is cancelled, and they continue running even after `process()` has returned — which is exactly what causes the silent disappearing jobs.

**Fix:** Remove the class-level `private val scope` entirely and replace all usage with the `coroutineScope {}` builder inside `process()`. Coroutines are now children of the calling coroutine's `Job` and inherit its cancellation and lifecycle automatically.

**Explanation:** Structured concurrency requires that every coroutine has a parent that owns it. When you launch on a separate, long-lived `CoroutineScope`, you break that parent-child chain — the launched coroutine is an orphan from the perspective of the calling coroutine. This means cancellation does not propagate: if the caller is cancelled mid-flight, the orphaned coroutines keep running (or silently disappear when their dispatcher's thread pool is recycled). Using `coroutineScope {}` re-establishes the chain: the builder's `Job` becomes the parent of every `launch` inside it, cancellation flows correctly, and the suspension ensures the caller always observes the final state of all jobs.
