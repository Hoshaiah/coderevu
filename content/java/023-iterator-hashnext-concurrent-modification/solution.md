## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — HashMap Resize During Iterator Causes Infinite Loop
// ------------------------------------------------------------------------

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class MetricAggregator implements Runnable {
    // CHANGE 1: Replace HashMap with ConcurrentHashMap so that internal resize/rehash operations are thread-safe and can never produce an infinite loop in readers or writers.
    private final Map<String, Long> counters = new ConcurrentHashMap<>();

    // Called by writer threads
    public void increment(String metric) {
        // CHANGE 3: ConcurrentHashMap.merge() is atomic per key, so concurrent increments from multiple writers are no longer subject to lost-update races.
        counters.merge(metric, 1L, Long::sum);
    }

    // Runs on its own background thread
    @Override
    public void run() {
        while (true) {
            long total = 0;
            // CHANGE 2: Iterating over ConcurrentHashMap.entrySet() is safe under concurrent modification — it will not throw ConcurrentModificationException and will not spin forever due to a corrupted internal linked list.
            for (Map.Entry<String, Long> entry : counters.entrySet()) {
                total += entry.getValue();
            }
            System.out.println("Total: " + total);
            try { Thread.sleep(5000); } catch (InterruptedException e) { break; }
        }
    }
}
```

## Explanation

### Issue 1: HashMap resize causes infinite loop

**Problem:** Under concurrent access, the reader thread spins at 100% CPU inside `HashMap.get()` or the equivalent internal traversal method and never returns. The JVM must be killed to recover.

**Fix:** Replace `new HashMap<>()` with `new ConcurrentHashMap<>()` at the field declaration (CHANGE 1). This is the only structural change needed to eliminate the spin.

**Explanation:** In Java's pre-8 `HashMap` (and even in Java 8 under certain circumstances with the old table-entry linked lists), a concurrent resize from a writer thread can corrupt the internal linked-list chain for a bucket, creating a cycle. When the reader later traverses that bucket, it follows the cyclic `next` pointers forever. `ConcurrentHashMap` uses a striped-lock design for writes and a lock-free approach for reads, so its internal structures are never left in a state that produces a cycle. Switching to `ConcurrentHashMap` eliminates the only code path that can produce this spin.

---

### Issue 2: Iterator over HashMap races with structural modifications

**Problem:** The for-each loop over `counters.entrySet()` in the reader thread holds an iterator that was created before any concurrent `merge()` calls. If a writer adds a new key (a structural modification) while the iterator is active, `HashMap` will either throw `ConcurrentModificationException` on the next `next()` call or, in the corrupted-chain scenario described above, loop forever.

**Fix:** The CHANGE 2 comment sits over the for-each loop. Because the field is now a `ConcurrentHashMap` (CHANGE 1), its `entrySet()` iterator is a weakly-consistent iterator: it tolerates concurrent insertions and deletions without throwing and without entering an infinite loop.

**Explanation:** `HashMap`'s iterator tracks a `modCount` and throws `ConcurrentModificationException` as a best-effort safety check, but that check is itself not thread-safe — the read of `modCount` is not synchronized, so the exception is not guaranteed. On some JVM/hardware combinations the corruption is silently swallowed and the iterator just spins or skips data. `ConcurrentHashMap`'s iterator is designed for exactly this scenario: it snapshots segment metadata as it proceeds, so it always terminates and never throws, while reflecting at-least the state of the map at iterator-creation time.

---

### Issue 3: Lost-update race on counter increment

**Problem:** Two writer threads can both read the same current value for a metric, each add 1, and then both write the same result back, so one increment is silently lost. Over time, the reported totals are lower than the actual number of events.

**Fix:** The CHANGE 3 comment sits on the `counters.merge()` call in `increment()`. No change to the method signature or logic is needed — the fix is purely that `ConcurrentHashMap.merge()` performs its read-modify-write atomically per key using an internal `synchronized` block on the bin, while `HashMap.merge()` offers no such guarantee.

**Explanation:** `HashMap.merge()` is a default method on `Map` that calls `get()`, computes the new value, and calls `put()` — three separate, non-atomic operations. If thread A and thread B both call `merge("clicks", 1L, Long::sum)` when the current value is 5, both read 5, both compute 6, and both write 6, leaving the counter at 6 instead of 7. `ConcurrentHashMap` overrides `merge()` with an implementation that holds the bin lock for the entire read-compute-write sequence, making it atomic. No external synchronization is needed for single-key counter increments.
