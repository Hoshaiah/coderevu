## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Race on Coroutine Counter Increment
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicInteger

class EventCounter {
    // CHANGE 1: Replace plain `var count: Int` with AtomicInteger so each increment is a single atomic CAS operation, eliminating lost-update races.
    // CHANGE 2: AtomicInteger also provides full visibility guarantees across threads, removing the need for a separate @Volatile annotation.
    private val count = AtomicInteger(0)

    suspend fun processBatch(events: List<String>) = coroutineScope {
        events.map { event ->
            launch(Dispatchers.Default) {
                // simulate processing
                // CHANGE 1: Use incrementAndGet() instead of ++ so the read-add-write is atomic and no increment can be lost.
                count.incrementAndGet()
            }
        }.joinAll()
    }

    // CHANGE 1: Return count.get() to read the AtomicInteger value instead of a plain Int field.
    fun total(): Int = count.get()
}
```

## Explanation

### Issue 1: Non-atomic increment loses concurrent updates

**Problem:** Operators see a final count that is consistently lower than the number of events actually emitted. The gap grows as parallelism increases — at 4 threads roughly 5% of increments are lost, at 8 threads roughly 20% are lost. No exception is thrown, so nothing signals that updates are being silently dropped.

**Fix:** Replace the `var count: Int` field with `val count = AtomicInteger(0)`, call `count.incrementAndGet()` inside the coroutine body, and return `count.get()` from `total()`. These are the three `CHANGE 1` sites.

**Explanation:** The `++` operator on a plain `Int` compiles to three distinct steps: read the current value, add 1, write the result back. When two coroutines running on different threads execute those steps concurrently, both can read the same value (say, 42), both compute 43, and both write 43 — so two increments produce a net gain of only 1. `AtomicInteger.incrementAndGet()` performs the entire read-modify-write as a single hardware compare-and-swap instruction, so concurrent calls cannot overwrite each other. The higher the parallelism, the more frequently two threads land in the three-step window at the same time, which is exactly why the loss percentage grows with thread count.

---

### Issue 2: Plain field has no cross-thread visibility guarantee

**Problem:** Even when increments happen to be non-overlapping in time, the JVM memory model does not guarantee that a write on one thread is immediately visible to a read on another thread unless a happens-before relationship is established. A coroutine on thread A could write `count = 5` and another coroutine on thread B could still read `count = 4` from a CPU cache or register.

**Fix:** Switching to `AtomicInteger` (the `CHANGE 2` site, same field declaration as `CHANGE 1`) provides visibility guarantees as part of its contract — every `get()` and `incrementAndGet()` observes the most recent value across all threads. No separate `@Volatile` annotation is required.

**Explanation:** The JVM memory model allows threads to keep copies of variables in CPU registers or L1 caches and flush them lazily. `@Volatile` forces every read and write to go through main memory, establishing visibility, but it still does not prevent two threads from racing through the three-step increment. `AtomicInteger` solves both problems at once: its internal field is `volatile`, and it uses a hardware CAS loop to guarantee the entire increment is atomic. Using `@Volatile` alone on a plain `Int` would improve visibility but would not fix the lost-update race described in Issue 1.
