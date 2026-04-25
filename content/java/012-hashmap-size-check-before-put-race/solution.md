## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — HashMap Size Check Before Put Race
// ------------------------------------------------------------------------

import java.util.HashMap;
import java.util.Map;

public class BoundedCache<K, V> {
    private final Map<K, V> store = new HashMap<>();
    private final int maxSize;

    public BoundedCache(int maxSize) {
        this.maxSize = maxSize;
    }

    public synchronized V get(K key) {
        return store.get(key);
    }

    // CHANGE 1: added synchronized so the size check and the put are one atomic operation, preventing multiple threads from passing the guard concurrently.
    public synchronized void put(K key, V value) {
        if (store.size() < maxSize) {
            store.put(key, value);
        }
    }

    // CHANGE 2: added synchronized so callers reading the size see a consistent value and do not race with concurrent put() or get() calls.
    public synchronized int size() {
        return store.size();
    }
}
```

## Explanation

### Issue 1: `put()` Missing Synchronized Keyword

**Problem:** The cache grows well beyond `maxSize` under concurrent load. Monitoring shows the map holding two or three times as many entries as the configured limit, which drives heap pressure and GC pauses.

**Fix:** Add `synchronized` to the `put()` method declaration, matching what `get()` already has. This makes the `store.size() < maxSize` guard and the `store.put(key, value)` call execute as a single atomic step under the same intrinsic lock.

**Explanation:** Without `synchronized`, two threads can both call `put()` at the same moment. Thread A reads `store.size()` and finds it is one below `maxSize`, then pauses before inserting. Thread B reads the same size, also sees it is below the limit, and inserts its entry. Thread A resumes and inserts its entry. Both insertions succeed even though only one should have. Under heavy load, dozens of threads can pass the guard before any of them finishes inserting, causing the map to overshoot `maxSize` by as many concurrent callers as are active. Placing `synchronized` on `put()` forces each caller to hold the object's intrinsic lock for the entire check-then-act sequence, so only one thread at a time can evaluate the guard and conditionally insert.

---

### Issue 2: `size()` Not Synchronized

**Problem:** `size()` reads `store.size()` without holding the lock that `get()` and (after the fix) `put()` use. A caller that uses the returned value to make decisions — or a monitoring thread logging the count — can see a value that does not reflect the current state of the map.

**Fix:** Add `synchronized` to the `size()` method declaration. This ensures `size()` acquires the same intrinsic lock before reading from the `HashMap`, so it observes a consistent snapshot.

**Explanation:** `HashMap` makes no thread-safety guarantees. Reading `size()` on a `HashMap` while another thread is mid-insertion can return a value based on a partially updated internal state. Even if the JVM happens to return a coherent integer in practice for a single field read, the value can be stale: a thread may read zero after several entries have already been inserted because the write has not been flushed to that thread's view of memory. Adding `synchronized` establishes a happens-before relationship with any preceding `put()` or `get()` call that also held the lock, guaranteeing the caller sees all previously committed writes. A related pitfall is using the return value of an unsynchronized `size()` as part of a decision in a different method — even if `size()` itself is now safe, the check-then-act sequence must still be atomic, which is why `put()` must also be synchronized.
