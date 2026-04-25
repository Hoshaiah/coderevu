## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Synchronized Block on Local Variable
// ------------------------------------------------------------------------

import java.util.HashMap;
import java.util.Map;

public class RequestCounter {

    // CHANGE 1: single shared lock instance field instead of a new local Object per call — all threads now contend on the same monitor
    private final Object lock = new Object();

    private final Map<String, Integer> counts = new HashMap<>();

    public void increment(String endpoint) {
        // CHANGE 1: synchronize on the shared instance field `lock`, not a freshly allocated local variable
        synchronized (lock) {
            // CHANGE 2: `counts` is now safely accessed only inside blocks guarded by the shared `lock`, preventing concurrent HashMap corruption
            counts.merge(endpoint, 1, Integer::sum);
        }
    }

    public Map<String, Integer> snapshot() {
        // CHANGE 1: same shared `lock` field used here so snapshot and increment are mutually exclusive
        synchronized (lock) {
            return new HashMap<>(counts);
        }
    }
}
```

## Explanation

### Issue 1: Lock Object Created Per Call

**Problem:** Every call to `increment()` or `snapshot()` allocates a brand-new `Object lock = new Object()` and then synchronizes on it. Because each invocation gets its own object, two threads calling `increment()` simultaneously each hold a lock on a *different* object. Neither thread ever waits for the other, so the `synchronized` keyword provides no protection at all. The result is concurrent unguarded writes to `counts`, which causes increments to be lost.

**Fix:** Replace the local `Object lock = new Object()` with a single `private final Object lock = new Object()` field declared at the class level. Both `increment()` and `snapshot()` now reference the same field, so `synchronized (lock)` in every method refers to the same monitor.

**Explanation:** Java's `synchronized` block serializes threads only when they compete to acquire the monitor of the *same* object. When `lock` is a local variable, every stack frame creates a fresh object with its own identity, so threads never share a monitor and never block each other. Promoting `lock` to a field means every thread that calls any synchronized method on the same `RequestCounter` instance is competing for that one object's monitor. A related pitfall: if you had used `synchronized (this)` in both methods, that would also have worked correctly — `this` is the same shared instance for all callers — but an explicit `private final` lock field is preferred when you want to hide the lock from external code that might also try to synchronize on the same instance.

---

### Issue 2: Unsynchronized Access to HashMap

**Problem:** `HashMap` is not thread-safe. Concurrent `put`/`merge` calls without synchronization can cause internal state corruption — entries can be silently dropped, or a resize operation on one thread can leave the map in a broken state that makes subsequent reads return wrong values. The dashboard sees counts that are lower than the actual number of increments made.

**Fix:** All accesses to `counts` (both the `merge` in `increment()` and the copy constructor call in `snapshot()`) are now placed inside `synchronized (lock)` blocks that use the shared `lock` field from Issue 1. No change to the `HashMap` type itself is required because the synchronization now fully protects every access.

**Explanation:** `HashMap` assumes single-threaded access. When two threads call `merge()` concurrently, both may read the current value for a key, compute an updated value independently, and then each write their result — so one write overwrites the other and one increment is lost. In the worst case, a concurrent rehash can leave internal linked-list or tree pointers in a state where lookups silently skip entries. Wrapping every read and write in the same `synchronized` block guarantees that only one thread touches the map at a time. An alternative would be `ConcurrentHashMap` with its atomic `merge()`, which avoids any explicit locking, but the shared-lock approach is correct and consistent with the rest of the class design.
