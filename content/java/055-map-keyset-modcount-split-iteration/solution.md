## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — keySet forEachRemaining Skips Entries
// ------------------------------------------------------------------------

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class MetricsExporter {
    private final Map<String, Long> counters = new HashMap<>();

    public synchronized void increment(String metric) {
        counters.merge(metric, 1L, Long::sum);
    }

    // CHANGE 2: added synchronized so export() holds the same monitor as increment(), preventing concurrent modification of counters during drain.
    public synchronized String export() {
        StringBuilder sb = new StringBuilder();
        Iterator<String> keyIt = counters.keySet().iterator();
        while (keyIt.hasNext()) {
            String key = keyIt.next();
            sb.append(key).append('=').append(counters.get(key)).append('\n');
            // CHANGE 1: replaced counters.remove(key) with keyIt.remove() so the entry is removed through the iterator itself, avoiding ConcurrentModificationException and skipped entries.
            keyIt.remove();
        }
        return sb.toString();
    }
}
```

## Explanation

### Issue 1: Iterator Invalidated by Direct Map Removal

**Problem:** Some metrics never appear in the exported string even though `increment()` was definitely called for them. On some JVM runs the code throws `ConcurrentModificationException`; on others it silently skips every other entry because the iterator's internal cursor gets confused after the backing map is structurally modified.

**Fix:** Replace `counters.remove(key)` with `keyIt.remove()` at the removal site. `keyIt.remove()` removes the current entry through the iterator's own bookkeeping, which is the only safe way to delete elements during iteration.

**Explanation:** A `HashMap`'s `keySet()` iterator tracks a `modCount` on the map. Every call to `counters.remove(key)` increments that `modCount`. On the next call to `keyIt.hasNext()` or `keyIt.next()`, the iterator detects the mismatch and either throws `ConcurrentModificationException` or — because the fail-fast check is not guaranteed — silently produces wrong results by jumping over entries in the internal bucket array. Calling `keyIt.remove()` instead routes the deletion through the iterator, which updates `modCount` in a way the iterator itself expects, so iteration continues correctly. A related pitfall: copying the keys into a separate list before the loop would also avoid the problem, but it allocates an extra collection; using `keyIt.remove()` is allocation-free.

---

### Issue 2: export() Not Synchronized Allows Race with increment()

**Problem:** `increment()` is `synchronized` on the `MetricsExporter` instance, but `export()` is not. When the metrics-flush thread calls `export()` at the same time as an application thread calls `increment()`, `increment()` can insert or update a counter while `export()` is mid-iteration, causing `ConcurrentModificationException` or producing an export that silently omits the concurrently written metric.

**Fix:** Add the `synchronized` keyword to the `export()` method declaration, making it acquire the same intrinsic lock as `increment()`.

**Explanation:** Java's `synchronized` instance methods all lock on `this`. Because `increment()` already uses `synchronized`, adding `synchronized` to `export()` means the two methods cannot run at the same time on the same `MetricsExporter` object. Without this, the flush thread and any application thread calling `increment()` compete on the `HashMap` with no mutual exclusion: `HashMap` is not thread-safe, so a concurrent structural modification (resize, new bucket entry) can corrupt the iterator state completely independently of Issue 1. Holding the lock for the full duration of `export()` is acceptable here because the method drains and returns quickly; if latency became a concern, a swap-and-drain pattern (swap `counters` for a fresh map under a short lock, then iterate the old map outside the lock) would limit contention.
