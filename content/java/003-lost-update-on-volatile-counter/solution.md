## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Volatile Field Lost Update
// ------------------------------------------------------------------------

import java.util.concurrent.atomic.AtomicLong;

public class RequestCounter {
    // CHANGE 1: Replace volatile long with AtomicLong so increment() is a single atomic operation, not a racy read-modify-write.
    private final AtomicLong count = new AtomicLong(0);

    public void increment() {
        // CHANGE 1: Use incrementAndGet() which is a single atomic CAS-backed operation, eliminating the lost-update race.
        count.incrementAndGet();
    }

    public long getCount() {
        return count.get();
    }

    public void reset() {
        // CHANGE 2: Use set(0) on AtomicLong so the reset is atomic and visible to all threads without risking a torn write racing with increments.
        count.set(0);
    }
}
```

## Explanation

### Issue 1: Non-Atomic Increment Loses Updates

**Problem:** Under concurrent load the request count reported to the dashboard is 10–20% lower than the true number of requests seen in access logs. The gap widens as the thread count grows. No exception is thrown and no error is logged, so the bug is invisible until you compare metrics sources.

**Fix:** Replace `private volatile long count` with `private final AtomicLong count = new AtomicLong(0)` and replace `count++` with `count.incrementAndGet()`.

**Explanation:** `volatile` guarantees that every thread sees the most recently written value of `count`, but `count++` is not one operation — it compiles to a read, an add, and a write. Two threads can both read the same value (say 42), both compute 43, and both write 43 back, turning two increments into one. `AtomicLong.incrementAndGet()` uses a single CPU-level compare-and-swap instruction that retries if another thread modified the value between the read and the write, so no increment is ever silently dropped. A related pitfall: even if you add `synchronized` to `increment()` alone, leaving `getCount()` unsynchronized still breaks the happens-before chain on some JVMs — `AtomicLong` sidesteps that entirely.

---

### Issue 2: Reset Races with In-Flight Increments

**Problem:** The reporting thread calls `reset()` after publishing metrics. If request-handling threads are simultaneously calling `increment()`, the plain assignment `count = 0` can overwrite increments that arrived just before or during the reset, silently dropping those counts from all future reports.

**Fix:** Replace `count = 0` with `count.set(0)` on the `AtomicLong`, which performs an atomic volatile write coordinated with the same memory-ordering guarantees used by `incrementAndGet()`.

**Explanation:** With `volatile long`, the write `count = 0` is itself atomic at the memory level for a 64-bit value on most JVMs, but the sequence of events around it is not: a thread can read `count` (getting 99), then the reset fires writing 0, then the first thread writes 100. The net result is 100 in the counter even though the reset was supposed to clear it, or conversely the reset can overwrite a burst of increments. `AtomicLong.set()` does not solve the logical race of deciding which increments belong to the current reporting window versus the next one, but it does ensure the write itself is fully visible and ordered with respect to concurrent `incrementAndGet()` calls. If stricter snapshot semantics are needed, `getAndSet(0)` returns the old value atomically, which lets the caller publish and reset in a single step without any increment slipping into the gap.
