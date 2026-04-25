## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Shared Mutable List in associateWith
// ------------------------------------------------------------------------

data class AnalyticsEvent(val userId: String, val name: String)

class EventGrouper {

    fun groupByUser(events: List<AnalyticsEvent>): Map<String, List<AnalyticsEvent>> {
        val result = mutableMapOf<String, MutableList<AnalyticsEvent>>()

        for (event in events) {
            // CHANGE 1: create a fresh mutableListOf() per user via getOrPut instead of sharing a single `bucket`; this ensures each key owns its own list instance.
            val bucket = result.getOrPut(event.userId) { mutableListOf() }
            // CHANGE 2: add the event to the per-user bucket unconditionally here, after retrieval/creation, so no event is ever skipped.
            bucket.add(event)
        }

        return result
    }
}
```

## Explanation

### Issue 1: Single shared list assigned to every user

**Problem:** Every entry in the result map points to the same `bucket` list object. When the batch sender reads `result["user-A"]` and `result["user-B"]`, both references return the identical list, which by the end of the loop contains every event from every user.

**Fix:** Remove the single `val bucket` declared outside the loop. Replace the `result[event.userId] = bucket` assignment with `result.getOrPut(event.userId) { mutableListOf() }`, which creates a brand-new list the first time a user ID is seen and returns the existing one on subsequent calls.

**Explanation:** In Kotlin (and the JVM generally), assigning a list to a map does not copy the list — it stores a reference. All map values end up pointing to the one `bucket` object allocated before the loop. `getOrPut` solves this by running the lambda `{ mutableListOf() }` only on the first encounter of each key, so each user gets its own independent list. A related pitfall: if you try to fix this by moving `val bucket = mutableListOf()` inside the loop unconditionally, you would create a new list on every iteration and overwrite the previous one, losing all but the last event per user — so the `getOrPut` pattern is the right tool here.

---

### Issue 2: Current event is added after map assignment, causing the first event per user to appear in the wrong position

**Problem:** In the original code, `result[event.userId] = bucket` runs before `bucket.add(event)`. Because the map stores a reference to `bucket`, the add does eventually show up — but the ordering dependency means that if you tried to snapshot or copy the list at assignment time, the triggering event would be absent. More concretely, the event that caused a new bucket to be created is added after the fact, making the logic fragile and order-sensitive.

**Fix:** After obtaining (or creating) the per-user list via `getOrPut`, call `bucket.add(event)` immediately and unconditionally on the next line, with no conditional guard around it.

**Explanation:** The original `if (existing == null)` block only assigned the shared list to the map; the `bucket.add(event)` outside the block ran for every event regardless. Moving to `getOrPut` eliminates the need for the null check entirely, and placing `bucket.add(event)` directly after ensures every event — including the one that triggers list creation — is appended in a single, predictable step. This removes the implicit temporal coupling between map insertion and list mutation that made the original code hard to reason about.
