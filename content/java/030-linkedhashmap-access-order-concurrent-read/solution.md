## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — LinkedHashMap Access-Order Concurrent Read
// ------------------------------------------------------------------------

import java.util.LinkedHashMap;
import java.util.Map;

public class LruCache<K, V> {
    private final Map<K, V> cache;

    public LruCache(int maxSize) {
        this.cache = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                return size() > maxSize;
            }
        };
    }

    public synchronized void put(K key, V value) {
        cache.put(key, value);
    }

    // CHANGE 1: added `synchronized` because access-order LinkedHashMap mutates its internal linked list on every `get`, making reads non-thread-safe when any concurrent structural change (put/eviction) is happening.
    public synchronized V get(K key) {
        return cache.get(key);
    }

    // CHANGE 2: added `synchronized` so that `size()` cannot observe a partially updated map while a concurrent `put` is in progress.
    public synchronized int size() {
        return cache.size();
    }
}
```

## Explanation

### Issue 1: Unsynchronized `get` Corrupts Linked List

**Problem:** Threads hang indefinitely inside `get`. Heap dumps show cyclic references in the `LinkedHashMap`'s internal doubly-linked list. The symptom is a thread stuck in an infinite loop traversing the same nodes repeatedly.

**Fix:** Add `synchronized` to the `get` method (CHANGE 1), matching the synchronization already present on `put`.

**Explanation:** `LinkedHashMap` in access-order mode (`accessOrder = true`) physically moves the accessed entry to the tail of its internal doubly-linked list on every `get` call — it is not a read-only operation. When one thread is inside `put` (which also relinks nodes, and may trigger `removeEldestEntry` and an eviction), and another thread concurrently calls `get` (which relinks the same list), both threads manipulate `before`/`after` pointers on the same node objects without any memory visibility or mutual exclusion guarantee. This produces a cycle: node A's `after` points to node B, but node B's `before` does not point back to A, and iteration never terminates. Making `get` `synchronized` on the same intrinsic lock as `put` ensures the two operations are mutually exclusive, so the linked list is never modified by two threads simultaneously.

---

### Issue 2: Unsynchronized `size()` Returns Stale Data

**Problem:** Callers reading `size()` while a concurrent `put` is executing can see a value that reflects a partially completed insertion or eviction, because `size` is a field inside `HashMap` that is written without any lock during structural changes.

**Fix:** Add `synchronized` to the `size()` method (CHANGE 2) so it acquires the same intrinsic lock used by `put` and `get` before reading `cache.size()`.

**Explanation:** `HashMap.size` is a plain `int` field. A `put` that triggers an eviction decrements it after the removal; a `put` that adds a new key increments it after the insertion. A thread calling `size()` without holding the lock can read this field mid-update and see either an inflated or a deflated count. While this is a milder issue than the linked-list corruption, it can cause incorrect behavior in any caller that uses `size()` to make capacity decisions. Synchronizing `size()` on the same monitor eliminates the data race at negligible cost.
