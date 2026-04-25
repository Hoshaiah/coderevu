## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Flow Buffer Drops Emissions Silently
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class SensorReading(val sensorId: String, val value: Double, val timestamp: Long)

class SensorPipeline(
    private val readings: SharedFlow<SensorReading>,
    private val scope: CoroutineScope
) {
    fun start() {
        scope.launch {
            readings
                // CHANGE 2: Increased capacity from 64 to 4096 to accommodate the ~25x mismatch between producer rate (500 Hz) and consumer throughput (~20 writes/sec), giving headroom for transient spikes.
                // CHANGE 1: Changed onBufferOverflow from DROP_OLDEST to SUSPEND so the producer is back-pressured instead of silently losing readings; data integrity is required here.
                .buffer(capacity = 4096, onBufferOverflow = BufferOverflow.SUSPEND)
                .collect { reading ->
                    writeToDatabase(reading)
                }
        }
    }

    private suspend fun writeToDatabase(reading: SensorReading) {
        delay(20) // simulates DB write latency
        println("Written: ${reading.sensorId} @ ${reading.timestamp}")
    }
}
```

## Explanation

### Issue 1: DROP_OLDEST Silently Discards Sensor Readings

**Problem:** Ops sees roughly 80% of expected data points missing in the time-series DB. The producer emits at the correct rate, but emissions never reach the `collect` lambda. No errors or exceptions are raised anywhere.

**Fix:** Replace `BufferOverflow.DROP_OLDEST` with `BufferOverflow.SUSPEND` on the `.buffer(...)` call so the coroutine suspends the upstream `SharedFlow` collector instead of evicting buffered readings.

**Explanation:** When the buffer is full and `DROP_OLDEST` is set, Kotlin's `buffer` operator immediately discards the oldest item in the buffer to make room for each new emission — no exception, no log, no signal to the caller. At 500 Hz with a 50ms DB write latency, the consumer processes roughly 20 readings per second, so the buffer fills almost instantly and the operator starts throwing away ~96% of readings on an ongoing basis. Switching to `SUSPEND` applies back-pressure: the coroutine collecting from `SharedFlow` blocks until the buffer has space, which propagates upstream and slows the effective intake rate to match what the consumer can handle. The trade-off is that the `SharedFlow` upstream may itself start dropping if its own `extraBufferCapacity` fills, but that is a separate, visible configuration point rather than a silent hole in the pipeline.

---

### Issue 2: Buffer Capacity Too Small for Throughput Ratio

**Problem:** Even with a non-dropping overflow strategy, a capacity of 64 will be exhausted in about 0.13 seconds (64 slots ÷ 500 Hz) before back-pressure has any effect or before the consumer drains enough to stabilize. During startup, before the consumer reaches steady state, this makes overflow essentially guaranteed.

**Fix:** Increase `capacity` from `64` to `4096` in the `.buffer(...)` call, giving the pipeline roughly 8 seconds of burst absorption at 500 Hz — enough to survive transient slowdowns without immediately hitting the overflow policy.

**Explanation:** The producer emits 500 items per second; the consumer handles about 20 per second (1000ms ÷ 50ms write latency, adjusted for `delay(20)` which is actually 20ms giving ~50 writes/sec — still well below 500). The buffer needs to be large enough to absorb the burst while back-pressure signals propagate and the upstream `SharedFlow` collector slows down. With `SUSPEND` and a buffer of 64, the overflow policy is hit almost immediately anyway, which in practice means the system never reaches a stable throughput. A capacity of 4096 provides roughly 8 seconds of headroom at full producer rate, covering typical startup transients and short consumer stalls without requiring the upstream source to be throttled externally.
