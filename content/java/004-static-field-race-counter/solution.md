## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Unsynchronized Static Counter Race
// ------------------------------------------------------------------------

import java.util.concurrent.atomic.AtomicLong;

public class RequestMetrics {
    // CHANGE 1+2: Replace plain `long` with `AtomicLong` — provides both atomicity for read-modify-write and full memory visibility across threads without explicit synchronization.
    private static final AtomicLong requestCount = new AtomicLong(0);

    public static void increment() {
        // CHANGE 1: Use `incrementAndGet()` instead of `requestCount++` — this is a single atomic CAS operation, so no two threads can interleave their read-increment-write steps and lose an update.
        requestCount.incrementAndGet();
    }

    public static long get() {
        // CHANGE 2: `AtomicLong.get()` has volatile read semantics, so the monitoring thread always sees the most recently written value rather than a CPU-cached stale copy.
        return requestCount.get();
    }

    public static void reset() {
        // CHANGE 1+2: `set(0)` is atomic and visible to all threads immediately, replacing the plain assignment that had no atomicity or visibility guarantees.
        requestCount.set(0);
    }
}
```

## Explanation

### Issue 1: Lost updates from non-atomic increment

**Problem:** After 1000 concurrent calls to `increment()`, the counter often shows 900 or fewer. Increments are silently discarded under load, and the discrepancy gets worse as thread-pool concurrency increases.

**Fix:** Replace `requestCount++` with `requestCount.incrementAndGet()` on the `AtomicLong` field. The field declaration changes from `private static long requestCount = 0` to `private static final AtomicLong requestCount = new AtomicLong(0)`, and `reset()` changes from `requestCount = 0` to `requestCount.set(0)`.

**Explanation:** The Java expression `requestCount++` compiles to three distinct bytecode operations: read the current value, add one, write the result back. When two threads execute these steps concurrently, one thread can read the value before the other thread's write lands, then overwrite it with its own incremented copy. Both threads think they incremented, but the net effect is only one increment was recorded — this is called a lost update. `AtomicLong.incrementAndGet()` performs the read-add-write as a single hardware-level compare-and-swap (CAS) instruction. If two threads race, one wins the CAS and the other retries, so no update is ever discarded. A related pitfall: even replacing `++` with `synchronized` blocks on `requestCount` would work, but `AtomicLong` avoids lock contention and is the idiomatic Java solution for this pattern.

---

### Issue 2: Stale reads due to missing visibility guarantee

**Problem:** The monitoring thread calling `get()` can observe a counter value that is behind the true count, even independently of lost updates. This manifests as the counter appearing to stall or move backward over short windows on the metrics dashboard.

**Fix:** Switching the field to `AtomicLong` gives `get()` volatile-read semantics automatically. No additional `volatile` keyword or `synchronized` block is needed on the `get()` method itself.

**Explanation:** The Java Memory Model does not guarantee that a write to a plain (non-`volatile`, non-synchronized) variable in one thread is immediately visible to reads in another thread. The JVM and CPU are both allowed to cache values in registers or store buffers and flush them lazily. So a writer thread can call `increment()` and successfully update its local CPU cache, but the monitoring thread on a different core may keep reading from its own stale cache line for an arbitrary period. `AtomicLong` internally uses a `volatile` field, which inserts the necessary memory barriers: every write is flushed to main memory, and every read bypasses caches and loads from main memory. This eliminates the class of stale-read bugs where the value appears to go backward even when no updates are lost.
