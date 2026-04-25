## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Mutable Set in Data Class Key
// ------------------------------------------------------------------------

// CHANGE 1+3: Use an immutable Set (Set<String>) instead of MutableSet in the data class so hashCode is stable, and copy the input defensively so external mutations cannot affect the stored key.
data class PermissionSet(val permissions: Set<String>)

class PermissionCache {
    private val cache = HashMap<PermissionSet, Boolean>()

    fun put(permissions: MutableSet<String>, result: Boolean) {
        // CHANGE 3: Copy the set to prevent external mutations from changing the key's hashCode after insertion.
        val key = PermissionSet(permissions.toHashSet())
        cache[key] = result
    }

    fun get(permissions: MutableSet<String>): Boolean? {
        // CHANGE 3: Copy the set so the lookup key is independent of the caller's set reference.
        val key = PermissionSet(permissions.toHashSet())
        return cache[key]
    }

    fun invalidate(permissions: MutableSet<String>) {
        // CHANGE 2: Build the key before any mutation, and do NOT mutate the caller's set at all — the sentinel add was wrong and would corrupt the caller's data.
        val key = PermissionSet(permissions.toHashSet())
        cache.remove(key)
    }
}
```

## Explanation

### Issue 1: Mutable set field makes hashCode unstable

**Problem:** `data class PermissionSet` derives its `hashCode` from its fields. When the field is a `MutableSet`, the hash is computed from the set's current contents. If the set is mutated after the key is inserted into the `HashMap`, the key moves to the wrong hash bucket and can never be found again — even though `equals` returns `true`.

**Fix:** Change the `permissions` field type in `PermissionSet` from `MutableSet<String>` to `Set<String>`. This is marked `// CHANGE 1+3` in the data class declaration.

**Explanation:** `HashMap` stores entries in buckets determined by `hashCode`. When you call `cache[key]`, the map computes the hash of the lookup key and checks only that bucket. If the stored key's hash changed after insertion (because the underlying `MutableSet` was mutated), the stored entry is in a different bucket, so the map never finds it and returns `null`. Changing the field type to the immutable `Set<String>` interface does not prevent mutations by itself — but combined with the defensive copy in issue 3, the stored set is a separate object that nobody else can mutate. A related pitfall: even without explicit mutations, passing the same `MutableSet` reference into both `put` and `get` means both keys share the same object, so `equals` returns `true`, but the hash remains stable only by accident in that case.

---

### Issue 2: invalidate() mutates the caller's set before removing the key

**Problem:** `invalidate` calls `permissions.add("__invalidate__")` on the `MutableSet` passed in by the caller, before calling `cache.remove(key)`. The `key` was built before the add, but adding to the caller's set corrupts data the caller still holds a reference to. The remove also operates on the pre-mutation hash, which may no longer match where the entry is stored.

**Fix:** Remove the `permissions.add("__invalidate__")` line entirely. The `// CHANGE 2` comment in `invalidate` shows the corrected version: build the key from a copy of the input set and call `cache.remove(key)` directly.

**Explanation:** The `add` call appears to have been an attempt to distinguish invalidation calls from normal lookups, but it achieves nothing useful — the sentinel string is never used downstream. What it does do is mutate a `MutableSet` owned by the caller, which is a side effect the caller cannot see or guard against. Additionally, the hash of `key` (built before the add) will differ from the hash the entry was stored under if the stored key's set has already been mutated, so the `remove` may silently do nothing.

---

### Issue 3: No defensive copy lets external mutations affect stored keys

**Problem:** Both `put` and `get` pass the caller's `MutableSet` directly into `PermissionSet(permissions)`. The data class stores that reference. Any mutation the caller makes to their set after calling `put` — even adding a single element — changes the stored key's `hashCode` and makes all future `get` calls miss.

**Fix:** Replace `PermissionSet(permissions)` with `PermissionSet(permissions.toHashSet())` in `put`, `get`, and `invalidate`. This is shown at the `// CHANGE 3` sites. `toHashSet()` creates a new independent `HashSet` with the same contents.

**Explanation:** Without a copy, `PermissionSet` holds a reference to the caller's set object. The caller may not even realize they are mutating the cache's internal key — for example, if they reuse the same `MutableSet` across multiple permission checks and add to it incrementally. Taking a snapshot at the time of the call means the stored key's hash is frozen at insertion time and the lookup key's hash is computed from the same snapshot contents, so they always land in the same bucket. `toHashSet()` is appropriate here because `HashSet` has O(1) `contains` and its `hashCode` matches that of any other `Set` with the same elements, which preserves `equals`/`hashCode` contract compatibility with the data class.
