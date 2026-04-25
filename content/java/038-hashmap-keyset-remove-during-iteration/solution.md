## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Map KeySet Modified During Iteration
// ------------------------------------------------------------------------

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.time.Instant;
import java.util.Iterator;

public class TtlCache<K, V> {
    // CHANGE 2: replaced HashMap with ConcurrentHashMap so concurrent reads from other threads do not corrupt internal state or cause infinite rehash loops
    private final Map<K, CacheEntry<V>> store = new ConcurrentHashMap<>();

    public void put(K key, V value, Instant expiresAt) {
        store.put(key, new CacheEntry<>(value, expiresAt));
    }

    public V get(K key) {
        CacheEntry<V> entry = store.get(key);
        return (entry != null) ? entry.value : null;
    }

    public void evictExpired(Instant now) {
        // CHANGE 1: use entrySet().removeIf() instead of iterating keySet() and calling remove() inside the loop; removeIf() uses the iterator's own remove() method which does not throw ConcurrentModificationException
        store.entrySet().removeIf(e -> e.getValue().expiresAt.isBefore(now));
    }

    private static class CacheEntry<V> {
        final V value;
        final Instant expiresAt;
        CacheEntry(V value, Instant expiresAt) {
            this.value = value;
            this.expiresAt = expiresAt;
        }
    }
}
```

## Explanation

### Issue 1: keySet Iterator Invalidated by Remove

**Problem:** `evictExpired()` iterates over `store.keySet()` with a for-each loop and calls `store.remove(key)` inside the body. Every call to `store.remove()` increments the HashMap's internal `modCount`. When the for-each loop advances to the next key it checks `modCount` against the value it saved at iterator creation; they differ, so it throws `ConcurrentModificationException`. In production this crashes the `@Scheduled` task, which Spring swallows silently, and eviction never runs again until the service restarts.

**Fix:** Replace the for-each loop entirely with `store.entrySet().removeIf(e -> e.getValue().expiresAt.isBefore(now))`. The `removeIf` method internally calls the iterator's own `remove()` method, which updates `modCount` in sync with the iterator so no mismatch occurs.

**Explanation:** Java collection iterators track structural modifications through a `modCount` field. The iterator snapshots `modCount` when created and compares it on every `next()` call. Calling `Map.remove()` directly from outside the iterator increments `modCount` without telling the iterator, so the next `next()` call sees the mismatch and throws. The iterator's own `remove()` method — used internally by `removeIf` — increments `modCount` and updates the iterator's snapshot at the same time, keeping them in sync. A related pitfall: even collecting keys into a separate list and removing them after the loop would work, but `removeIf` is cleaner and avoids the extra allocation.

---

### Issue 2: HashMap Unsafe for Concurrent Reads

**Problem:** `HashMap` is not thread-safe. The product catalog service reads from the cache on multiple threads while the scheduler thread writes. A concurrent read during a resize/rehash can follow a corrupted internal linked list, causing an infinite loop that pins a CPU core, or returning wrong values silently.

**Fix:** Replace `new HashMap<>()` with `new ConcurrentHashMap<>()` at the field declaration. `ConcurrentHashMap` uses segment-level locking (in Java 8+, CAS operations on individual bins) so reads never block and writes do not corrupt the structure under concurrent access.

**Explanation:** When a `HashMap` reaches its load-factor threshold it rehashes: it allocates a new internal array and moves all entries. A reader thread can see the table in a partially migrated state where a bucket's linked list has been split and some nodes point into the old array, causing the reader to loop forever following stale `next` pointers. `ConcurrentHashMap` avoids this by using a `volatile` table reference and per-bin synchronization, so a reader always sees a consistent bin even while a resize is in progress. Switching to `ConcurrentHashMap` also makes `removeIf` on the entry set safe under concurrent reads because `ConcurrentHashMap.EntrySet.removeIf` is implemented to handle concurrent access correctly.
