## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — ConflatedChannel Silently Drops Events
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*

class UploadWorker(private val uploader: FileUploader) {

    suspend fun run(files: List<String>) = coroutineScope {
        // CHANGE 1: Use Channel.UNLIMITED (or a large buffer) instead of Channel.CONFLATED so every file is queued and none are dropped when the producer outruns the consumer.
        val channel = Channel<String>(Channel.UNLIMITED)

        launch {
            for (file in files) {
                channel.send(file)
            }
            channel.close()
        }

        launch {
            for (file in channel) {
                uploader.upload(file)
            }
        }
    }
}
```

## Explanation

### Issue 1: `CONFLATED` channel silently drops queued files

**Problem:** Some files are never uploaded and no error is logged. The symptom is non-deterministic and only appears when the filesystem scanner produces files faster than the uploader consumes them — exactly the conditions users reported.

**Fix:** Replace `Channel.CONFLATED` with `Channel.UNLIMITED` on the `Channel<String>(...)` constructor call. This is the only token that changes.

**Explanation:** `Channel.CONFLATED` is a specialised capacity mode that keeps at most one element at a time. When a new element is sent before the consumer has read the previous one, the older element is discarded and replaced. The channel never suspends the sender and never throws — it just quietly drops data. So when the scanner calls `send` for file B while the uploader is still uploading file A, file A's path is thrown away. `Channel.UNLIMITED` buffers every sent element in an unbounded queue and never drops anything; the consumer drains it at whatever pace `uploader.upload` allows. A related pitfall: if memory is a concern and the file list could be enormous, use a bounded buffer (e.g. `Channel(64)`) with back-pressure instead — the producer will suspend when the buffer is full, which is the correct behaviour for a bounded-memory pipeline.

---

### Issue 2: Producer and consumer race before the consumer starts iterating

**Problem:** Both coroutines are launched concurrently. On a fast machine or a small file list, the producer can finish sending all files and close the channel before the consumer coroutine has even started its `for` loop. Combined with `CONFLATED`, this guarantees at most one file is ever uploaded.

**Fix:** Switching to `Channel.UNLIMITED` (CHANGE 1) also resolves this race: because all sent elements are buffered, it does not matter whether the consumer starts before or after the producer finishes — every element is preserved in the queue until the consumer reads it. No structural change to the launch ordering is needed once the buffer is correct.

**Explanation:** `coroutineScope` schedules both `launch` blocks on the same dispatcher. There is no guarantee about which one gets CPU time first. The producer may run to completion — sending every file and calling `channel.close()` — while the consumer coroutine is still waiting to be scheduled. With `CONFLATED`, only the last file sent survives in the channel at that point. With an unlimited or sufficiently large buffer, every file is present in the queue when the consumer eventually starts iterating, so the race becomes harmless.
