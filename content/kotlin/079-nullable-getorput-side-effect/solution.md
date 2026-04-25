## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — getOrPut Evaluates Default Always
// ------------------------------------------------------------------------

import java.util.concurrent.ConcurrentHashMap

class UserProfileCache(private val profileService: ProfileService) {

    // CHANGE 2: Use ConcurrentHashMap instead of HashMap to make concurrent reads/writes from multiple API handler threads safe.
    private val cache = ConcurrentHashMap<String, java.util.Optional<UserProfile>>()

    fun get(userId: String): UserProfile? {
        // CHANGE 1: Replace getOrPut (which re-invokes the lambda when the stored value is null) with an explicit containsKey check so that a stored null (confirmed-absent user) is returned without calling profileService again.
        if (cache.containsKey(userId)) {
            return cache[userId]?.orElse(null)
        }
        val profile = profileService.fetchProfile(userId)
        cache[userId] = java.util.Optional.ofNullable(profile)
        return profile
    }
}

data class UserProfile(val id: String, val name: String)

interface ProfileService {
    fun fetchProfile(userId: String): UserProfile?
}
```

## Explanation

### Issue 1: `getOrPut` Ignores Stored `null`

**Problem:** After a user is confirmed non-existent, the cache stores `null` for that key. On the next lookup, `getOrPut` sees a `null` value and treats the key as absent, so it runs the lambda again and calls `profileService.fetchProfile`. The profile service receives one request per cache lookup for every confirmed-absent user, which is exactly the symptom reported in metrics.

**Fix:** Replace the `getOrPut` call with an explicit `containsKey` check followed by a direct `cache[userId]` read. The stored value is wrapped in `java.util.Optional<UserProfile>` so the map — now typed `ConcurrentHashMap<String, Optional<UserProfile>>` — never holds a raw `null`, eliminating the ambiguity between "not cached" and "cached as absent".

**Explanation:** `getOrPut` is defined in the Kotlin stdlib to check `get(key) == null` to decide whether to invoke the default lambda. When the map genuinely stores `null` for a key, `get(key)` returns `null`, so `getOrPut` cannot distinguish "key is missing" from "key maps to null". It calls the lambda every time. Wrapping the value in `Optional` removes this ambiguity: `Optional.empty()` is a non-null object that means "confirmed absent", and `Optional.of(profile)` carries the real profile. The `containsKey` path then short-circuits immediately for any previously seen user ID, whether their profile exists or not. A related pitfall: even if you switched to a `MutableMap` extension that handled nulls, you would still need the `Optional` wrapper to distinguish the two absent states when using a map that rejects nulls (like `ConcurrentHashMap`).

---

### Issue 2: `HashMap` Not Thread-Safe

**Problem:** The original code uses `HashMap`, which has no synchronization. Multiple API handler threads calling `get` concurrently can corrupt the internal array of the map, causing lost entries, infinite loops, or `ConcurrentModificationException`, depending on timing.

**Fix:** Replace `HashMap<String, UserProfile?>()` with `ConcurrentHashMap<String, java.util.Optional<UserProfile>>()` as shown at the CHANGE 2 site. `ConcurrentHashMap` uses segment-level locking so concurrent reads and writes are safe without external synchronization.

**Explanation:** `HashMap` is explicitly documented as not thread-safe. When two threads resize the map simultaneously, they can create a cycle in the internal linked list that causes a `get` call to spin forever. `ConcurrentHashMap` eliminates this by making each bucket operation atomic. Note that `ConcurrentHashMap` itself does not accept `null` values, which is actually the right constraint here — it forces the use of `Optional` to represent the absent-user state, aligning the fix for Issue 1 and Issue 2 cleanly.
