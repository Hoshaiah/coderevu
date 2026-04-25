## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Data Class HashCode Changes After Insert
// ------------------------------------------------------------------------

// CHANGE 1: Replace MutableList with List so the field holds an immutable snapshot; callers can no longer mutate the key after construction, keeping hashCode stable across map operations.
data class QueryKey(
    val query: String,
    val filters: List<String>  // immutable list — hashCode cannot change after construction
)

data class Result(val id: Int, val value: String)

class QueryCache {
    private val cache = HashMap<QueryKey, List<Result>>()

    fun put(key: QueryKey, results: List<Result>) {
        cache[key] = results
    }

    fun get(key: QueryKey): List<Result>? {
        return cache[key]
    }
}

fun main() {
    val cache = QueryCache()
    // CHANGE 2: Build the complete filter list before constructing the key, then insert; the key's hashCode is fixed at construction time and cannot drift.
    val key = QueryKey("SELECT *", listOf("active", "premium"))
    cache.put(key, listOf(Result(1, "foo")))

    // Lookup now succeeds: hashCode is identical at insert and lookup time
    println(cache.get(key))  // prints [Result(id=1, value=foo)]
}
```

## Explanation

### Issue 1: Mutable List Field Breaks HashMap Key Stability

**Problem:** After `cache.put(key, results)` stores the entry, the caller calls `key.filters.add("premium")`, which mutates the list inside the `QueryKey` that was already used as a map key. The next call to `cache.get(key)` returns `null` even though the key object is identical, because the entry is now in the wrong bucket.

**Fix:** Change the `filters` field in `QueryKey` from `MutableList<String>` to `List<String>` (CHANGE 1). This means `List<String>` (backed by Kotlin's read-only list interface) is declared as the field type, removing the `add` method from the public API of the field.

**Explanation:** A `HashMap` stores entries in buckets determined by `hashCode()` at insertion time. Kotlin data classes derive `hashCode()` from all constructor properties, including `filters`. When `filters` is a `MutableList`, calling `add()` on it changes its contents, which changes the `hashCode()` returned by `QueryKey`. On the next `get`, the map computes the new hash, looks in a different bucket, finds nothing, and returns `null`. Switching to `List<String>` does not magically make the list immutable at the JVM level (a `listOf(...)` result is a `java.util.Arrays$ArrayList` which is unmodifiable), but it removes the `add` method from the Kotlin-visible API so callers cannot accidentally mutate it. The correct pattern, shown in CHANGE 2, is to assemble all filter values before constructing the key, so the key is complete and stable from the moment it is created.

---

### Issue 2: Key Constructed Before All Filters Are Known

**Problem:** The `QueryKey` is built with only `"active"` in the filter list, inserted into the map, and then `"premium"` is added afterward. This means the key used for insertion and the key used for lookup represent different logical queries, which is a correctness bug even apart from the hashCode issue.

**Fix:** Construct the `QueryKey` with the full, final list of filters in a single `listOf("active", "premium")` call before calling `cache.put` (CHANGE 2), so no post-construction mutation is needed or possible.

**Explanation:** Even if the `MutableList` hashCode issue were somehow worked around, inserting a key that represents a partial query and then mutating it to represent a different query means the cached result is associated with the wrong key. Any subsequent lookup with the full filter set would need to reconstruct the exact final state of the key to get a hit. Constructing the key in its final state before insertion avoids this entirely. A related pitfall is copying the list on construction — `val filters: List<String> = ArrayList(input)` — to guard against the caller mutating the original collection after passing it in; `listOf(...)` already returns an unmodifiable view, so the pattern in the fix is sufficient.
