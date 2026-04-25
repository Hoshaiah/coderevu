## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Race on Shared Counter Increment
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicInteger

class EventAggregator {
    // CHANGE 1: Replace plain `var Int` with `AtomicInteger` so that each increment is a single atomic read-modify-write operation, eliminating lost updates from concurrent coroutines racing on the counter.
    private val processedCount = AtomicInteger(0)

    suspend fun processAll(batches: List<List<String>>) = coroutineScope {
        batches.map { batch ->
            launch(Dispatchers.Default) {
                batch.forEach { event ->
                    process(event)
                    // CHANGE 1: Use `incrementAndGet()` instead of `++` so the increment is atomic and no concurrent update can be lost between the read and write steps.
                    processedCount.incrementAndGet()
                }
            }
        }.joinAll()
    }

    // CHANGE 2: Call `processedCount.get()` to read the value through the `AtomicInteger` API, which guarantees visibility of all prior writes regardless of which thread calls `report()`.
    fun report(): Int = processedCount.get()

    private fun process(event: String) {
        // simulate work
    }
}
```

## Explanation

### Issue 1: Data race on counter increment

**Problem:** Multiple coroutines running on `Dispatchers.Default` (a thread pool) all read and write the same `processedCount` field concurrently. The `++` operator is not atomic — it compiles to a read, an add, and a write. Two coroutines can both read the same value, both add 1, and both write the same result back, so one increment is permanently lost. Under load, 5–15% of increments disappear this way, and the exact loss varies per run because it depends on thread scheduling.

**Fix:** Replace `private var processedCount = 0` with `private val processedCount = AtomicInteger(0)` and replace `processedCount++` with `processedCount.incrementAndGet()`. `AtomicInteger` lives in `java.util.concurrent.atomic` and uses CPU-level compare-and-swap instructions to make the read-modify-write a single indivisible operation.

**Explanation:** The JVM does not make `Int` field increments thread-safe. `i++` desugars to `i = i + 1`, which is at minimum two memory operations. If thread A reads `i` as 42 and thread B also reads `i` as 42 before either writes back, both store 43 and the counter ends up as 43 instead of 44 — one event is lost. `AtomicInteger.incrementAndGet()` uses a hardware CAS loop: it reads the current value, computes the new value, and writes it back only if the field still holds the value it read; otherwise it retries. This guarantees exactly one increment per call regardless of concurrency. A related pitfall: replacing `++` with a `synchronized` block would also fix the race, but `AtomicInteger` avoids lock contention and is idiomatic for a single-counter use case.

---

### Issue 2: Missing memory visibility for `report()`

**Problem:** Even setting the race aside, a plain `var Int` field has no visibility guarantee across threads on the JVM. The thread that calls `report()` may read a stale cached value from its local CPU cache rather than the latest write, so the reported count can be lower than the true count even if the increments were somehow serialised.

**Fix:** The `AtomicInteger` introduced in CHANGE 1 also resolves this: reading via `processedCount.get()` in `report()` is a volatile read, which flushes CPU caches and returns the most recently written value seen by any thread.

**Explanation:** The Java Memory Model permits CPUs and the JIT to cache field values in registers or L1/L2 caches and not flush them to main memory immediately. A thread can therefore see an old snapshot of `processedCount` long after other threads have written newer values. `AtomicInteger` internally marks its `value` field as `volatile`, which inserts a memory barrier on every read and write. That barrier forces all preceding writes by any thread to be visible before the read completes. Without this guarantee, `report()` could return an arbitrarily stale count even after all coroutines have finished.
