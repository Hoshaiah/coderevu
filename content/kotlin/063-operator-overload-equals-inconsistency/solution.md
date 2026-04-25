## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — equals Overridden Without hashCode
// ------------------------------------------------------------------------

class SessionToken(val value: String) {
    override fun equals(other: Any?): Boolean {
        if (other !is SessionToken) return false
        return this.value == other.value
    }
    // CHANGE 1: Added hashCode override so tokens with the same value produce the same hash bucket, satisfying the equals/hashCode contract and allowing HashMap lookups to work correctly.
    override fun hashCode(): Int = value.hashCode()
}

class SessionStore {
    private val active = HashMap<SessionToken, Long>()

    fun register(token: SessionToken, expiresAt: Long) {
        active[token] = expiresAt
    }

    fun isActive(token: SessionToken): Boolean {
        return active.containsKey(token)
    }
}
```

## Explanation

### Issue 1: Missing `hashCode` Override on `SessionToken`

**Problem:** `isActive` always returns `false` even immediately after `register` is called with a token that compares equal via `equals`. Two `SessionToken` instances built from the same string are considered equal by `equals`, but because `hashCode` is not overridden, they inherit `Object.hashCode`, which returns a value derived from object identity (memory address). The two objects get different hash codes and land in different buckets of the `HashMap`, so `containsKey` never finds the stored entry.

**Fix:** Add `override fun hashCode(): Int = value.hashCode()` to `SessionToken` (the `CHANGE 1` site). This delegates the hash to the underlying `String`, which is consistent with how `equals` compares tokens.

**Explanation:** A `HashMap` locates an entry in two steps: first it computes `key.hashCode()` to find the right bucket, then it calls `key.equals(candidate)` on entries in that bucket. If two objects that are `equals`-equal produce different hash codes, the map puts them in different buckets and the lookup step never reaches the stored entry to call `equals` at all. The JVM `Object.hashCode` default is identity-based, so even two tokens wrapping the identical string `"abc"` return unrelated integers. Overriding `hashCode` to return `value.hashCode()` guarantees that any two tokens that pass `equals` also share a bucket, so the second lookup step can actually find the match. A related pitfall: if `SessionToken` were mutable and `value` changed after the token was inserted, the stored hash would be stale and lookups would still fail — keeping key fields immutable (as `val` here) avoids that.

---
