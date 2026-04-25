## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Synchronizing on Reassignable Field Monitor
// ------------------------------------------------------------------------

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class BoundedCache {
    // CHANGE 1: Introduce a dedicated, final lock object so the monitor identity never changes regardless of what happens to `store`.
    private final Object lock = new Object();

    private Map<String, String> store = new HashMap<>();
    private final int maxSize;

    public BoundedCache(int maxSize) {
        this.maxSize = maxSize;
    }

    public String get(String key) {
        // CHANGE 1: Synchronize on the stable `lock` object instead of the reassignable `store` field.
        synchronized (lock) {
            return store.get(key);
        }
    }

    public void put(String key, String value) {
        // CHANGE 1: Synchronize on the stable `lock` object instead of the reassignable `store` field.
        synchronized (lock) {
            if (store.size() >= maxSize) {
                evict();
            }
            store.put(key, value);
        }
    }

    private void evict() {
        // Called only while `lock` is held, so iterator access is safe.
        Iterator<String> it = store.keySet().iterator();
        if (it.hasNext()) {
            it.next();
            it.remove();
        }
    }

    public void rehash() {
        // CHANGE 2: Synchronize on `lock` before reassigning `store` so no other thread can read the old or new map in a half-updated state.
        synchronized (lock) {
            store = new HashMap<>(store);
        }
    }
}
```

## Explanation

### Issue 1: Synchronizing on Reassignable Field

**Problem:** Every `synchronized(store)` block uses the current value of `store` as the monitor. When `rehash()` assigns a new `HashMap` to `store`, threads that were already waiting on the old object and threads that enter after the reassignment lock on two completely different objects. At that point, `get` and `put` run concurrently with no mutual exclusion, which is how two threads can each successfully write different values for the same key.

**Fix:** A new `private final Object lock = new Object()` field is introduced, and every `synchronized` block — in `get`, `put`, and `rehash` — is changed to `synchronized(lock)` instead of `synchronized(store)`.

**Explanation:** Java's intrinsic lock is tied to a specific object reference, not to a variable name. When you write `synchronized(store)`, Java evaluates the expression `store` at the moment the thread tries to enter the block and locks that particular object. If another thread later executes `store = new HashMap<>(store)`, the field now points to a different object. Any subsequent `synchronized(store)` locks the *new* object, while threads already blocked are waiting on the *old* one — so two threads can hold what each believes is the only lock simultaneously. Using a dedicated `final` field eliminates this by guaranteeing the lock object identity is fixed for the lifetime of the `BoundedCache` instance. A common related pitfall is doing the same thing with `synchronized(this.someList)` and then reassigning `someList` inside the block, which has the same effect.

---

### Issue 2: Unsynchronized Reassignment of `store` in `rehash`

**Problem:** The original `rehash()` reads the old `store` reference and writes a new one without holding any lock. While this is happening, a concurrent `put` or `get` call (which does lock on `store`) may be reading from or writing to the map that `rehash` is in the process of replacing, causing lost updates or `ConcurrentModificationException` in the iterator inside `evict`.

**Fix:** `rehash()` is wrapped in `synchronized(lock)` so that the read of the old map and the write of the new reference happen atomically with respect to every other operation that also holds `lock`.

**Explanation:** Without the lock, `rehash` creates a snapshot copy of the map and then stores it back. Between those two steps, `put` may insert a key into the *old* map; `rehash` then overwrites `store` with the snapshot that was taken before that insert, silently dropping the entry. Similarly, if `put` is mid-way through `evict` — iterating over the map — and `rehash` simultaneously swaps the reference, the iterator's internal `modCount` check can fire a `ConcurrentModificationException` even though the developer already synchronized on what they thought was the right monitor. Acquiring `lock` in `rehash` serializes all of these operations so no thread ever sees a torn state.
