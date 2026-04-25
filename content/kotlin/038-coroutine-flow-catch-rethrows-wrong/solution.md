## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Flow catch Swallows Cancellation
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class SyncRepository(private val remoteSource: RemoteSource) {

    fun syncFlow(): Flow<SyncResult> = flow {
        val records = remoteSource.fetchAll()
        records.forEach { record ->
            // CHANGE 2: add ensureActive() before each emit so the loop honours cancellation even when fetchAll returns a large list all at once.
            currentCoroutineContext().ensureActive()
            emit(SyncResult.Success(record.transform()))
        }
    }.catch { e ->
        // CHANGE 1: rethrow CancellationException so structured concurrency can cancel the coroutine; only emit an error result for genuine non-cancellation failures.
        if (e is CancellationException) throw e
        emit(SyncResult.Error(e.message ?: "Unknown error"))
    }
}

sealed class SyncResult {
    data class Success(val data: String) : SyncResult()
    data class Error(val message: String) : SyncResult()
}

interface RemoteSource {
    suspend fun fetchAll(): List<Record>
}

data class Record(val raw: String) {
    fun transform(): String = raw.uppercase()
}
```

## Explanation

### Issue 1: `catch` swallows `CancellationException`

**Problem:** When `viewModelScope` is cancelled (e.g. the user navigates away), the coroutines runtime throws `CancellationException` into the running flow. The `catch` block intercepts it, emits a `SyncResult.Error`, and the flow completes normally — so the coroutine is never actually cancelled. The ViewModel scope thinks the job is done, but the work already ran to completion. Repeated navigations accumulate these ghost coroutines until the app runs out of memory.

**Fix:** Add `if (e is CancellationException) throw e` as the first line of the `catch` lambda (CHANGE 1). This re-throws `CancellationException` without emitting anything, letting structured concurrency propagate the cancellation normally.

**Explanation:** Kotlin coroutines use `CancellationException` as a cooperative signal — every `suspend` call checks for it and stops work. The `Flow.catch` operator is intentionally broad: it catches `Throwable`, which includes `CancellationException`. Once that exception is consumed and an `Error` result is emitted instead, the flow finishes successfully from the runtime's perspective and the parent scope never learns cancellation was requested. Re-throwing `CancellationException` restores the contract: the exception travels up the call chain, the coroutine job transitions to `Cancelled`, and the scope can clean up. A related pitfall: wrapping the entire flow collection in a plain `try/catch (e: Exception)` has the same problem because `CancellationException` extends `Exception`, not just `Throwable`.

---

### Issue 2: No cancellation checkpoints inside the processing loop

**Problem:** `fetchAll()` returns the full record list in one shot. If that list is large, the `forEach` loop iterates through all records without ever suspending, so no cancellation checkpoint is reached. Even after the CHANGE 1 fix, a cancellation request that arrives while the loop is running will not be honoured until the loop finishes naturally.

**Fix:** Call `currentCoroutineContext().ensureActive()` at the top of each loop iteration, just before `emit` (CHANGE 2). `ensureActive()` throws `CancellationException` immediately if the coroutine's job has been cancelled.

**Explanation:** Cancellation in Kotlin coroutines is cooperative: a coroutine must reach a suspension point or explicitly check its cancellation status for the cancellation to take effect. `emit` is a `suspend` function and does check, but only when the downstream collector is ready to receive; if the downstream is fast, `emit` may return immediately without ever yielding to the cancellation machinery. Adding `ensureActive()` before each `emit` guarantees one explicit check per record regardless of how fast the downstream consumes values. For very large datasets the ideal fix is to make `fetchAll` return a `Flow<Record>` and use `collect` so that each element is a natural suspension point, but that requires changing the `RemoteSource` interface; `ensureActive()` is the minimal, backwards-compatible fix.
