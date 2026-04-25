## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Concurrent HashMap Resize Infinite Loop
// ------------------------------------------------------------------------

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class RequestCache {
    // CHANGE 1: Replace HashMap with ConcurrentHashMap so concurrent get/put/remove are thread-safe without external locking and resize never produces a corrupt structure that causes infinite spin.
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public String get(String requestId) {
        return cache.get(requestId);
    }

    public void put(String requestId, String response) {
        cache.put(requestId, response);
    }

    public void evict(String requestId) {
        cache.remove(requestId);
    }

    public int size() {
        // CHANGE 2: size() on ConcurrentHashMap returns a best-effort count consistent with the happens-before guarantees already provided by ConcurrentHashMap internals, so callers see a reasonably current value without extra synchronization.
        return cache.size();
    }
}
```

## Explanation

### Issue 1: Concurrent HashMap Resize Infinite Spin

**Problem:** Under peak load, multiple threads call `put()` simultaneously. When `HashMap` decides to resize its internal bucket array, two threads can each be in the middle of relinking bucket entries. The result is a cycle in the linked list inside a bucket. Any subsequent `get()` or `put()` that lands on that bucket then loops forever following the cycle — all those threads appear RUNNABLE in a thread dump but never make progress, and the JVM never recovers without a restart.

**Fix:** Replace `new HashMap<>()` with `new ConcurrentHashMap<>()` at the field declaration (CHANGE 1). No other changes to the method bodies are needed.

**Explanation:** `HashMap` performs no internal synchronization. When two threads both trigger a resize at the same moment, they both iterate the old bucket's chain to copy entries into the new array. In Java 7 and earlier this directly creates a circular reference; in Java 8 the algorithm changed but concurrent structural modifications still corrupt state and can produce infinite loops or lost entries. `ConcurrentHashMap` avoids this by using fine-grained segment or bin-level locking (a `synchronized` block per bin in Java 8+) during resize, so only one thread at a time relinks a given bucket. Other threads either wait briefly on that bin or work on a different bin in parallel. No global lock is needed, so throughput stays high.

---

### Issue 2: Missing Memory Visibility Between Threads

**Problem:** Even setting aside the resize crash, a plain `HashMap` provides no happens-before guarantee between threads. A thread that calls `put()` may write the new entry only into its CPU's store buffer or cache. Another thread calling `get()` for the same key may read stale data — or, worse, see a partially constructed entry — because the JVM and CPU are free to reorder memory operations in the absence of a synchronization action.

**Fix:** `ConcurrentHashMap` (CHANGE 1) internally uses `volatile` reads and writes on the bin array, which establishes a happens-before relationship between a `put()` in one thread and a subsequent `get()` in another. The `size()` call (CHANGE 2) relies on the same internal volatile counters, so it returns a consistent recent value without needing additional synchronization in the caller.

**Explanation:** The Java Memory Model guarantees that a volatile write happens-before any subsequent volatile read of the same variable. `ConcurrentHashMap` stores its bin array as a `volatile` field and uses `Unsafe.putObjectVolatile` / `Unsafe.getObjectVolatile` for individual bin slots. When thread A finishes `put()`, its store to the volatile bin slot flushes to main memory. When thread B calls `get()`, the volatile load forces it to read from main memory, so it sees the value thread A wrote. With a plain `HashMap`, none of that flushing happens, so thread B may spin reading cached data or observe a half-initialized `Node` object.
