## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Shared MutableMap Across Coroutines
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap

class CacheWarmer(private val api: ProductApi) {

    // CHANGE 1: Replace plain mutableMapOf (HashMap) with ConcurrentHashMap so concurrent reads and writes from multiple IO threads are safe without external locking.
    private val cache = ConcurrentHashMap<String, Product>()

    suspend fun warmAll(categories: List<String>) = coroutineScope {
        categories.map { category ->
            async(Dispatchers.IO) {
                val products = api.fetchCategory(category)
                for (product in products) {
                    cache[product.id] = product
                }
            }
        }.awaitAll()
    }

    // CHANGE 2: Return an unmodifiable snapshot of the map so callers iterating the result are not affected by any concurrent structural changes still happening in the background.
    fun getAll(): Map<String, Product> = HashMap(cache)
}
```

## Explanation

### Issue 1: Unsynchronized Concurrent Writes to HashMap

**Problem:** Under load, multiple coroutines running on `Dispatchers.IO` threads all write into the same `HashMap` simultaneously. `HashMap` is not thread-safe, so concurrent `put` calls can corrupt its internal array, causing entries to be silently lost or, in rare cases, producing an infinite loop inside the map's resize logic.

**Fix:** Replace `mutableMapOf<String, Product>()` (which creates a `HashMap`) with `ConcurrentHashMap<String, Product>()`. The declaration at `CHANGE 1` swaps the backing type while keeping the same `MutableMap` interface that the rest of the class uses.

**Explanation:** `HashMap` uses an internal array of buckets. When two threads call `put` at the same time and both trigger a resize, they each compute a new array independently and then one overwrites the other's fully-populated array with its own half-populated copy — the entries the losing thread had already inserted disappear. `ConcurrentHashMap` uses fine-grained segment-level locking (or CAS operations in modern JDKs) so concurrent writes to different keys proceed in parallel safely, and writes to the same key are serialised without losing either update.

---

### Issue 2: Iteration Over a Potentially Changing Map

**Problem:** `getAll()` returns the live `cache` reference directly. If any caller iterates the returned map while a background warm-up is still inserting entries — or even if the `HashMap` was left in a partially corrupted state from issue 1 — the iteration throws `ConcurrentModificationException` or silently skips entries.

**Fix:** At `CHANGE 2`, `getAll()` now returns `HashMap(cache)`, a defensive copy taken at the moment of the call. The caller receives a stable, independent snapshot and can iterate it freely.

**Explanation:** Java's fail-fast iterators check a `modCount` field on every `next()` call. A structural change (an insertion or deletion) increments `modCount`, and the iterator throws `ConcurrentModificationException` the next time it is called. By copying into a fresh `HashMap` inside `getAll()`, the snapshot's `modCount` never changes after construction, so iteration is always safe. A related pitfall: even after switching to `ConcurrentHashMap` for issue 1, returning the live map still allows a caller to see a partially-warmed view that changes under their feet mid-iteration; the snapshot removes that race entirely.
