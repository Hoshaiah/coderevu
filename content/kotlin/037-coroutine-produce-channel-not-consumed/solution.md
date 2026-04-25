## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — produce Channel Hangs on Send
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*

data class Record(val id: Int, val payload: String)

class RecordProducer(private val scope: CoroutineScope) {

    fun produceRecords(): ReceiveChannel<Record> = scope.produce {
        val records = fetchAllRecords()
        for (record in records) {
            send(record)
        }
    }

    suspend fun runPipeline() {
        val channel = produceRecords()
        // CHANGE 1: Wrap consumer in a coroutineScope so that if it throws, the exception propagates and the enclosing scope (and thus the channel) is cancelled, unblocking the producer's send.
        // CHANGE 3: Using coroutineScope here creates a structured relationship: the producer channel's Job is a child of the same scope, so cancellation flows correctly when the consumer fails.
        coroutineScope {
            // CHANGE 2: launch inside coroutineScope instead of the outer scope so that an unhandled exception in the consumer cancels the coroutineScope and is rethrown to the caller rather than being silently lost.
            launch {
                try {
                    for (record in channel) {
                        processRecord(record)
                    }
                } catch (e: Exception) {
                    // CHANGE 1: Cancel the producer channel explicitly when the consumer exits with an exception, so the producer's send call sees a closed channel and stops blocking.
                    channel.cancel(CancellationException("Consumer failed: ${e.message}", e))
                    throw e
                }
            }
        }
    }

    private suspend fun fetchAllRecords(): List<Record> {
        delay(10)
        return List(100) { Record(it, "payload-$it") }
    }

    private suspend fun processRecord(record: Record) {
        if (record.id == 50) throw RuntimeException("Processing failed at record 50")
        delay(1)
    }
}
```

## Explanation

### Issue 1: Producer `send` blocks on dead consumer

**Problem:** When the consumer coroutine throws an exception, it stops reading from the channel. The producer is still suspended on `send` waiting for the consumer to drain the next slot. Because nothing cancels the channel, `send` waits forever and the ETL job never terminates.

**Fix:** In the `catch` block inside the consumer `launch`, call `channel.cancel(CancellationException(...))` before rethrowing the exception. This closes the channel from the receive side, causing the producer's pending `send` to throw `ClosedSendChannelException` and exit cleanly.

**Explanation:** A `produce`-built channel is a `SendChannel` backed by a coroutine. When a sender calls `send` on a full (or rendezvous) channel, it suspends until a receiver consumes the item. If the receiver exits without cancelling the channel, the `SendChannel` remains open and the producer suspends indefinitely — the channel has no automatic dead-consumer detection. Calling `channel.cancel()` transitions the channel to a cancelled state, which causes any suspended `send` to resume with an exception immediately. The producer coroutine catches `ClosedSendChannelException`, unwinds, and completes. Without this explicit cancellation, even a job-level timeout only kills the whole process rather than letting the pipeline recover gracefully.

---

### Issue 2: Consumer exceptions silently discarded

**Problem:** `scope.launch { ... }` installs a default `CoroutineExceptionHandler` that, in many contexts, just logs or ignores the exception. The pipeline caller gets back from `runPipeline` without knowing that processing stopped at record 50. Operators see no error; they only notice the job never produced output.

**Fix:** Replace the outer `scope.launch` with a `coroutineScope { launch { ... } }` block inside `runPipeline`. `coroutineScope` rethrows any child exception to its caller, so `runPipeline` propagates the failure up the call stack where the job scheduler can handle it.

**Explanation:** `CoroutineScope.launch` is a "fire and forget" builder. Exceptions inside it go to the scope's `CoroutineExceptionHandler`, not to the call site of `launch`. `coroutineScope` (the suspend function) is different: it waits for all its children and rethrows the first exception any child throws. Wrapping the consumer `launch` inside `coroutineScope` means that when `processRecord` throws, the exception bubbles out of `runPipeline` as a normal `suspend` function exception that callers can catch and log or retry. This is the standard structured-concurrency pattern for pipelines where the caller must be informed of failures.

---

### Issue 3: Producer and consumer structurally unrelated

**Problem:** The producer runs as a child of the outer `scope`, and the original consumer also launches into the same flat `scope`. Neither is a child of the other, so a failure in one has no automatic effect on the other's lifecycle.

**Fix:** Move the consumer `launch` inside a `coroutineScope { }` block. This creates a nested scope whose lifetime is bounded by its children. The producer channel (created via `scope.produce`) is cancelled explicitly in the consumer's catch block (CHANGE 1), and the `coroutineScope` propagates the exception to `runPipeline`'s caller (CHANGE 2), giving the two coroutines a coordinated shutdown path.

**Explanation:** Structured concurrency requires that parent scopes outlive their children and that child failures propagate upward. When you launch the consumer directly into the same `scope` as the producer, you get two siblings with no parent-child relationship between them — their lifetimes are independent. Nesting the consumer inside `coroutineScope` makes the suspend function itself the synchronisation point: it does not return until the consumer finishes or fails, and it propagates any failure outward. Combined with the explicit `channel.cancel()` on consumer failure, this ensures the producer always has a path to termination when the consumer is gone.
