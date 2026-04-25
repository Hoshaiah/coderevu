## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Scope Cancel Skips Finally Block
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class ChunkedUploader(private val scope: CoroutineScope) {

    fun startUpload(fileBytes: ByteArray): Job {
        return scope.launch {
            val uploadId = initiateMultipart()
            try {
                uploadChunks(fileBytes, uploadId)
            } finally {
                // CHANGE 1: wrap finaliseUpload in withContext(NonCancellable) so the suspend call runs even when the coroutine is cancelled — without this, any suspension point inside the finally block immediately throws CancellationException and the S3 commit never happens.
                withContext(NonCancellable) {
                    try {
                        finaliseUpload(uploadId)
                    } catch (e: Exception) {
                        // CHANGE 2: catch and log exceptions from finaliseUpload so callers see a completed (not failed) Job while the cleanup error is still surfaced for diagnostics.
                        println("ERROR: failed to finalise upload $uploadId: ${e.message}")
                    }
                }
            }
        }
    }

    private suspend fun initiateMultipart(): String {
        delay(10)
        return "upload-id-123"
    }

    private suspend fun uploadChunks(bytes: ByteArray, uploadId: String) {
        delay(500) // simulate chunked upload
    }

    private suspend fun finaliseUpload(uploadId: String) {
        delay(50) // S3 commit call
        println("Finalised upload $uploadId")
    }
}
```

## Explanation

### Issue 1: Suspend Call Skipped in Cancelled Finally Block

**Problem:** When the enclosing `CoroutineScope` is cancelled, the coroutine enters a cancelled state before the `finally` block finishes. Any `suspend` call made inside that `finally` block — including `finaliseUpload(uploadId)` — immediately throws `CancellationException` at its first suspension point. The S3 `CompleteMultipartUpload` request is never sent, leaving a partial upload that costs money.

**Fix:** Wrap the `finaliseUpload(uploadId)` call in `withContext(NonCancellable) { ... }` (CHANGE 1). `NonCancellable` is a `Job` that can never be cancelled, so any coroutine running inside it ignores the parent's cancellation signal and runs to completion.

**Explanation:** Kotlin coroutines propagate cancellation by throwing `CancellationException` at every suspension point. A `finally` block runs in the same coroutine context, so when the coroutine is already cancelled, the first `delay` or I/O call inside `finally` throws immediately. `withContext(NonCancellable)` temporarily replaces the active `Job` with one whose `isActive` is always `true`, so `delay(50)` and the network call inside `finaliseUpload` proceed normally. The parent cancellation is not lost — it resumes propagating once the `withContext` block exits. A related pitfall: if you only wrap the `delay` but not the whole function, you can still hit a suspension point outside the wrapper that throws before the S3 response arrives.

---

### Issue 2: Cleanup Exceptions Silently Swallow the Finalisation Outcome

**Problem:** If `finaliseUpload` itself throws (network timeout, S3 error, etc.) inside the `withContext(NonCancellable)` block, that exception propagates out of the `finally` block and supersedes any exception from `uploadChunks`. Callers observing the returned `Job` see a failure with a confusing S3 exception instead of the original cancellation, and there is no log entry identifying which upload ID failed cleanup.

**Fix:** Add an inner `try/catch` around `finaliseUpload` inside the `withContext(NonCancellable)` block (CHANGE 2). Caught exceptions are printed with the `uploadId` so they appear in logs, while the `Job` state visible to callers reflects the upload attempt rather than the cleanup attempt.

**Explanation:** Kotlin's exception handling rule for `finally` blocks is the same as Java's: if the `finally` block itself throws, that new exception replaces the one being propagated from the `try` body. In a cancellation scenario the original exception is a `CancellationException`; replacing it with an S3 `IOException` breaks structured concurrency assumptions (the parent scope expects `CancellationException`). Catching inside the `finally` preserves the propagation chain. Logging the error instead of silently swallowing it means CloudWatch or your log aggregator can alert on finalisation failures independently of upload failures.
