## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Unconsumed Channel Causes Suspension
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*

class ImageProcessor {

    suspend fun processBatch(filePaths: List<String>) = coroutineScope {
        val channel = Channel<String>(capacity = 5)

        val producer = launch {
            for (path in filePaths) {
                channel.send(path)  // suspends when buffer is full
            }
            // CHANGE 1: Close the channel after all items are sent so the consumer's for-each loop terminates naturally.
            channel.close()
        }

        val consumer = launch {
            // CHANGE 1: Iterate with a for-in loop over the channel instead of a manual index loop; the loop ends when the channel is closed, eliminating the early-break dangling-producer bug.
            for (path in channel) {
                processImage(path)
                if (path.endsWith("_last.jpg")) {
                    // CHANGE 1: Cancel the channel instead of breaking silently so the producer unblocks and sees a cancellation rather than hanging on send.
                    channel.cancel()
                    break
                }
            }
        }

        consumer.join()
        // CHANGE 2: Join the producer instead of cancelAndJoin so that a normally-completing producer is awaited and any exception it threw is rethrown here.
        producer.join()
    }

    private suspend fun processImage(path: String) {
        delay(10)
        println("Processed: $path")
    }
}
```

## Explanation

### Issue 1: Consumer Early-Break Leaves Producer Suspended

**Problem:** When the consumer hits the `break` on the `_last.jpg` path, it exits its loop without closing or cancelling the channel. The producer is blocked inside `channel.send()` waiting for a slot in the 5-element buffer. Nothing ever drains that buffer again, so the producer suspends forever and `coroutineScope` never completes. The service process has to be killed manually.

**Fix:** The producer calls `channel.close()` after its loop finishes (CHANGE 1). The consumer switches to a `for (path in channel)` iteration (CHANGE 1), which respects the closed state. When the consumer needs to break early (the `_last.jpg` case), it calls `channel.cancel()` before `break` (CHANGE 1), which causes any pending `send` in the producer to throw `CancellationException` and unblock it.

**Explanation:** A `Channel` in Kotlin is a rendezvous or buffered queue between coroutines. When the buffer is full, `send` suspends until a receiver consumes an element. If the receiver stops consuming (due to `break`) but never signals the channel, `send` stays suspended indefinitely. `channel.close()` signals end-of-stream for the normal completion path: the producer closes after sending all items, and the consumer's `for-in` loop exits when it drains the last element. `channel.cancel()` handles the early-exit path: it marks the channel as failed, causing any suspended `send` to resume with an exception rather than wait forever. Without one of these two signals the producer has no way to know it should stop.

---

### Issue 2: Producer Cancelled Instead of Joined on Normal Exit

**Problem:** After the consumer finishes, the code calls `producer.cancelAndJoin()`. On the normal path (no early break, all items sent and consumed), the producer has already completed successfully. Cancelling a completed coroutine is harmless, but if the producer is still running due to a slow last `send`, cancelling it discards that work silently and suppresses any exception the producer might have thrown.

**Fix:** Replace `producer.cancelAndJoin()` with `producer.join()` (CHANGE 2). This waits for the producer to finish on its own and re-throws any exception it encountered.

**Explanation:** `cancelAndJoin` sends a cancellation signal before waiting. For a coroutine that is already done this is a no-op, but for one that is still suspended it interrupts it rather than letting it complete. After CHANGE 1 the producer either closes the channel normally (and finishes) or is cancelled by `channel.cancel()` from the consumer. In both cases `producer.join()` is the correct choice: it waits for the coroutine to reach a terminal state and propagates any unhandled exception into the `coroutineScope`, making failures visible rather than silent. A related pitfall: if you kept `cancelAndJoin` and removed the `channel.close()` call in the producer, the producer would be cancelled mid-batch on every run without any error being reported.
