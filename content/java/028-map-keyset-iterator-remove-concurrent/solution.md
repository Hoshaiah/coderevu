## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — HashMap Resize Triggers Infinite Loop
// ------------------------------------------------------------------------

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class MetricsAggregator implements Runnable {
    // CHANGE 1: Replace HashMap with ConcurrentHashMap so concurrent reads/writes from HTTP handler threads and the background thread do not corrupt internal bucket chains, which in Java 8 HashMap can form a cycle during resize and cause infinite loops.
    private final Map<String, Long> counters = new ConcurrentHashMap<>();
    private volatile boolean running = true;

    // Called from HTTP handler threads
    public void increment(String endpoint) {
        counters.merge(endpoint, 1L, Long::sum);
    }

    // Called from HTTP handler threads
    public long getCount(String endpoint) {
        return counters.getOrDefault(endpoint, 0L);
    }

    // Runs on a dedicated background thread
    @Override
    public void run() {
        while (running) {
            try {
                Thread.sleep(60_000);
                flushToDatabase();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private void flushToDatabase() {
        for (Map.Entry<String, Long> entry : counters.entrySet()) {
            // write entry to DB, then clear it
            // CHANGE 2: Use remove() or replace() via the iterator/map API instead of put() during iteration; here we use counters.put() outside the entry reference is fine with ConcurrentHashMap, but we switch to replace to atomically reset only if the value hasn't changed, avoiding a modification-during-iteration CME that would occur with a plain HashMap.
            counters.replace(entry.getKey(), entry.getValue(), 0L);
        }
    }
}
```

## Explanation

### Issue 1: Concurrent HashMap Access Causes Infinite Loop

**Problem:** HTTP handler threads call `increment` and `getCount` concurrently with each other and with `flushToDatabase` running on the background thread. Under sustained traffic, two threads trigger a `HashMap` resize at the same time. On Java 8, the resize operation rebuilds the bucket array by relinking entries; if two threads do this simultaneously they can write circular `next` pointers into the linked list of a bucket. Any subsequent iteration — including the next call to `flushToDatabase` — follows that cycle forever, pinning a CPU core at 100% with no way out short of a restart.

**Fix:** Replace the `HashMap` field declaration with a `ConcurrentHashMap` (CHANGE 1). `ConcurrentHashMap` uses segment-level or node-level locking (depending on JDK version) so concurrent structural modifications are safe and iteration is guaranteed to terminate.

**Explanation:** Java 8's `HashMap` uses a singly-linked list per bucket and, during resize, moves entries to a new array by iterating and relinking them. If thread A and thread B both see the load-factor threshold crossed and both start `resize()`, each thread reads the `next` pointer of an entry before the other has finished writing, and the result is that entry A points to entry B points to entry A — a cycle. The get/put code that walks the list then loops forever. `ConcurrentHashMap` avoids this because only one thread is ever allowed to restructure a given segment or tree-bin at a time. The bug is intermittent in tests because low concurrency rarely causes two threads to hit the resize threshold simultaneously; in production with sustained traffic it happens regularly.

---

### Issue 2: Map Modified During Iteration Risks ConcurrentModificationException

**Problem:** `flushToDatabase` iterates `counters.entrySet()` and inside the loop calls `counters.put(entry.getKey(), 0L)`. With a plain `HashMap` this triggers the fail-fast `modCount` check and throws `ConcurrentModificationException`. Even switching to `ConcurrentHashMap` doesn't make the reset atomic: a counter incremented between the read of `entry.getValue()` and the subsequent `put` will have its new increment silently zeroed out, losing data before it is flushed.

**Fix:** Replace `counters.put(entry.getKey(), 0L)` with `counters.replace(entry.getKey(), entry.getValue(), 0L)` (CHANGE 2). The three-argument `replace` is a compare-and-set: it only writes `0L` if the current value still equals `entry.getValue()`, so an increment that arrives between the read and the write is not lost — it just means the entry is not reset this cycle and will be flushed next time.

**Explanation:** `HashMap`'s iterator tracks an internal `modCount` and throws `ConcurrentModificationException` the moment it detects a structural change (including `put` on an existing key in some JDK versions). Even when this doesn't throw, calling `put` inside an entrySet iteration is undefined behavior per the `HashMap` contract. Switching to `ConcurrentHashMap` removes the exception risk because its iterators are weakly consistent, but the data-loss race remains: `increment` uses `merge` which is atomic on `ConcurrentHashMap`, but a plain `put(key, 0L)` afterward is not coordinated with that `merge`. Using `replace(key, expectedValue, 0L)` makes the reset conditional and atomic, so if `increment` fires between the iterator reading `entry.getValue()` and the `replace` executing, `replace` detects the mismatch, skips the reset, and the increment survives to the next flush cycle.
