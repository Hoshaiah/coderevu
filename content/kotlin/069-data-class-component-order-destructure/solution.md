## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Destructuring Binds Wrong Component
// ------------------------------------------------------------------------

data class Event(
    val id: String,
    val source: String,
    val priority: Int,
    val type: String,
    val payload: String
)

fun route(event: Event): String {
    // CHANGE 1: Added `priority` as the third destructured component so that `type` now correctly maps to position 4 and `payload` to position 5, matching the data class field order after the refactor.
    val (id, source, priority, type, payload) = event
    return when (type) {
        "ORDER" -> "orders-queue"
        "PAYMENT" -> "payments-queue"
        else -> "default-queue"
    }
}

fun processEvents(events: List<Event>) {
    events.forEach { event ->
        val queue = route(event)
        println("Routing event ${event.id} to $queue")
    }
}
```

## Explanation

### Issue 1: Destructuring Skips Inserted Field, Wrong Field Routed

**Problem:** After `priority` was inserted as the third field of `Event`, the destructuring `val (id, source, type, payload) = event` binds `type` to component 3 (`priority`, an `Int`) and `payload` to component 4 (the actual `type` `String`). The `when` expression in `route` then matches against an `Int` cast to a `String`, which never equals `"ORDER"` or `"PAYMENT"`, so every event falls through to `"default-queue"` regardless of its real type.

**Fix:** At the `CHANGE 1` site, `priority` is added as the third name in the destructuring declaration: `val (id, source, priority, type, payload) = event`. This makes each variable name align with the correct positional component again.

**Explanation:** Kotlin destructuring declarations are purely positional — they call `component1()`, `component2()`, etc. in declaration order; the variable names you write are irrelevant to which field gets bound. When a new field is inserted anywhere before the end of a data class, every destructuring that spans that position or beyond silently shifts. No compile error or warning is produced because the types happened to be compatible (or were widened via `Any`). The fix is to include all fields in the destructuring in the exact order they appear in the data class. A safer long-term alternative is to avoid destructuring entirely and access fields by name (`event.type`), which is immune to field reordering.

---

### Issue 2: Actual `payload` Field Silently Dropped From Destructuring

**Problem:** With only four names in the destructuring, the fifth component (`payload`) is never bound. The variable named `payload` in the old code actually holds the `type` string, and the real payload data is inaccessible inside `route`. If any downstream logic inside `route` were to use `payload`, it would operate on the wrong string with no indication anything is wrong.

**Fix:** At the same `CHANGE 1` site, adding `priority` pushes all subsequent names one position to the right, so `payload` now correctly binds to component 5, the actual `payload` field of the data class.

**Explanation:** Kotlin does not warn when a destructuring declaration has fewer components than the data class has fields — trailing components are silently ignored. This means dropping a field from the middle of a destructuring doesn't just skip that one field; it shifts every subsequent binding and silently discards the last real field. The compiler only enforces that you don't request more components than the class exposes. Any code that consumes the wrongly-named variable will run without error, making this class of bug hard to catch through normal compilation or even cursory code review.
