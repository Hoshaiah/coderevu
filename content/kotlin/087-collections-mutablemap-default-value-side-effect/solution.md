## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — getOrPut Runs Side Effect Unconditionally
// ------------------------------------------------------------------------

import java.util.concurrent.ConcurrentHashMap

data class UserBucket(val tier: String, val events: MutableList<String> = mutableListOf())

class EventAggregator {
    private val buckets = ConcurrentHashMap<String, UserBucket>()

    fun recordEvent(userId: String, event: String) {
        val bucket = getOrCreateBucket(userId)
        bucket.events.add(event)
    }

    private fun getOrCreateBucket(userId: String): UserBucket {
        // CHANGE 1 & 2: Replace getOrPut (evaluates lambda eagerly and is non-atomic) with computeIfAbsent, which evaluates the lambda only when the key is absent AND guarantees atomicity so fetchUserTier is called at most once per userId even under concurrent access.
        return buckets.computeIfAbsent(userId) { key ->
            val tier = fetchUserTier(key)
            UserBucket(tier)
        }
    }

    private fun fetchUserTier(userId: String): String {
        println("Fetching tier for $userId")  // should print once per user
        return "premium"
    }
}
```

## Explanation

### Issue 1: Lambda Evaluated Before Map Lookup

**Problem:** Every call to `getOrCreateBucket` invokes `fetchUserTier`, even when the bucket for that user already exists in the map. In production this means billing charges appear for every event recorded, not just the first event per user per window.

**Fix:** Replace `buckets.getOrPut(userId) { ... }` with `buckets.computeIfAbsent(userId) { key -> ... }`. The `computeIfAbsent` call evaluates its mapping function only when the key is genuinely absent from the map.

**Explanation:** Kotlin's `ConcurrentHashMap.getOrPut` extension (from `kotlin.collections`) is defined as: look up the key, and if missing, call `defaultValue()` and put the result. The problem is that the Kotlin standard library implementation computes `defaultValue()` eagerly — it calls the lambda, then checks whether to insert — so the lambda runs on every invocation regardless of whether the key was already present. `ConcurrentHashMap.computeIfAbsent` is a JDK method that defers evaluation of its mapping function until after confirming the key is absent, so the expensive call is skipped on the fast path. A related pitfall: even a lazy check-then-put idiom without `computeIfAbsent` would still be racy (see Issue 2).

---

### Issue 2: Non-Atomic Check-Then-Act Under Concurrency

**Problem:** When two threads process events for the same `userId` at the same time, both can reach the bucket-creation path simultaneously. Both end up calling `fetchUserTier`, and both store a result, so the external service is charged twice (or more) for the same user even if the lambda were evaluated lazily.

**Fix:** `computeIfAbsent` on `ConcurrentHashMap` provides an atomic compare-and-insert guarantee at the JDK level: only one thread's mapping function is allowed to run for a given key at a time, and the result of that single run is what gets stored.

**Explanation:** `ConcurrentHashMap.getOrPut` performs a non-atomic sequence: read the current value, decide it is absent, compute a new value, then write it. Between the read and the write, another thread can complete the same sequence for the same key, meaning both threads execute `fetchUserTier`. `computeIfAbsent` locks the relevant hash-bin during the entire check-and-compute step, so concurrent calls for the same key serialise: the second thread sees the value the first thread stored and returns it without calling the mapping function. One pitfall to keep in mind: `computeIfAbsent` does not protect the mutable state inside `UserBucket` (the `events` list), so callers of `bucket.events.add(event)` may still need synchronisation if high concurrency on a single user's list is expected.
