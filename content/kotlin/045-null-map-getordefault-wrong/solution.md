## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Null Value Mistaken for Missing Key
// ------------------------------------------------------------------------

class FeatureFlags(private val overrides: Map<String, String?>) {

    fun get(key: String, default: String?): String? {
        // CHANGE 1: Use containsKey instead of Elvis so a null value stored under the key is returned as-is, not treated as absent.
        // CHANGE 2: Only fall back to default when the key is truly missing from the map, preserving the null-means-disabled semantic.
        return if (overrides.containsKey(key)) overrides[key] else default
    }
}
```

## Explanation

### Issue 1: Elvis Operator Swallows Null Values

**Problem:** When an admin sets a flag to `null` in `overrides`, calling `overrides[key]` returns `null`, and the `?:` Elvis operator immediately substitutes `default` for it. The caller never sees `null`; it sees whatever the default is. Features the admin explicitly disabled get re-enabled silently.

**Fix:** Replace `overrides[key] ?: default` with `if (overrides.containsKey(key)) overrides[key] else default`. The Elvis operator is removed entirely at the `CHANGE 1` site.

**Explanation:** In Kotlin (and on the JVM generally), `map[key]` returns `null` for two distinct reasons: the key is absent, or the key maps to `null`. The `?:` operator cannot distinguish between those two cases — it treats both as "no value" and picks the right-hand side. `containsKey` queries the map's key set directly and returns `true` even when the stored value is `null`, so the null is forwarded to the caller correctly. A related pitfall: if you later switch to `getOrDefault`, note that it has the same blind spot as Elvis — it also returns the default when the value is `null`, not just when the key is missing.

---

### Issue 2: Missing Key-Presence Guard

**Problem:** The function has no mechanism to distinguish a stored `null` from an absent key, so the contract of the map (`null` = disabled by admin, missing = use default) cannot be honored. Any flag explicitly nulled out behaves identically to a flag that was never configured.

**Fix:** The `CHANGE 2` site introduces an explicit `else default` branch that only executes when `containsKey` returns `false`, making key absence the sole condition for returning `default`.

**Explanation:** The fix enforces the two-state contract at a single decision point: if the key exists, return whatever is stored (including `null`); if the key does not exist, return `default`. This mirrors how a nullable-value map is intended to be queried. Without this guard, the function collapses the two states into one, and callers have no way to recover the difference. If the map is later replaced with a `ConcurrentHashMap`, be aware that `ConcurrentHashMap` does not allow `null` values at all — that would require a different sentinel strategy, but `LinkedHashMap` and `HashMap` (what `mapOf` produces) support `null` values and work correctly with `containsKey`.
