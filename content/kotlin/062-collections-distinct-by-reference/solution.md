## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — distinctBy Compares Data Class References
// ------------------------------------------------------------------------

data class TelemetryEvent(
    val id: String,
    val source: String,
    val payload: Map<String, Any>
)

class ReportAggregator {
    fun merge(sourceA: List<TelemetryEvent>, sourceB: List<TelemetryEvent>): List<TelemetryEvent> {
        val combined = sourceA + sourceB
        // CHANGE 1: Extract only the event ID as the distinctBy key so that two events with the same id but different source/payload are treated as duplicates.
        return combined.distinctBy { it.id }
    }
}
```

## Explanation

### Issue 1: Wrong `distinctBy` Selector Key

**Problem:** The code calls `distinctBy { it }`, which uses the entire `TelemetryEvent` object as the grouping key. Because `TelemetryEvent` is a data class, its `equals`/`hashCode` compare all three fields: `id`, `source`, and `payload`. An event from source A and the same logical event from source B share the same `id` but differ in `source`, so `distinctBy` treats them as distinct and keeps both. Operators see duplicate event IDs in every merged batch, and the database throws a unique-constraint violation.

**Fix:** Replace `{ it }` with `{ it.id }` at the `distinctBy` call site. The lambda now returns a `String` (the event ID), which is the actual uniqueness criterion the database enforces.

**Explanation:** `distinctBy` works by running each element's selector lambda through a `LinkedHashSet`. Two elements are considered the same only when their selector results are equal. With `{ it }`, the selector is the data class itself, so `equals` compares `id AND source AND payload`. Changing the selector to `{ it.id }` means only the `id` string is inserted into the set; the second time an `id` is seen, that element is dropped regardless of its `source` or `payload`. A related pitfall: if you ever add a field to `TelemetryEvent` (e.g., a timestamp), `{ it }` would silently break deduplication again, while `{ it.id }` remains correct because the deduplication contract is defined by the database's unique constraint on `id`, not on the full row.
