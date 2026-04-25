## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Missing take on Infinite Sequence
// ------------------------------------------------------------------------

import java.time.LocalDate

class ReportScheduler {

    private fun monthlyDates(start: LocalDate): Sequence<LocalDate> = sequence {
        var current = start
        while (true) {
            yield(current)
            current = current.plusMonths(1)
        }
    }

    fun collectNext(start: LocalDate, count: Int): List<LocalDate> {
        return monthlyDates(start)
            .filter { it.dayOfWeek.value < 6 }  // business-day months only
            // CHANGE 1: add take(count) before toList() so the infinite sequence is bounded; without this, toList() never returns
            // CHANGE 2: count is now actually consumed here, fixing the unused-parameter bug and making the signature honest
            .take(count)
            .toList()
    }
}
```

## Explanation

### Issue 1: Missing `take()` on infinite sequence

**Problem:** `collectNext` calls `toList()` directly on a filtered infinite `Sequence`. The thread blocks inside `toList()` forever because the sequence never signals that it is exhausted. No exception is thrown, no log line after the call is reached, and the scheduled report is never produced.

**Fix:** Insert `.take(count)` between the `.filter { ... }` call and the `.toList()` call. `take(count)` wraps the sequence in a limiting layer that stops iteration once `count` elements have been emitted, so `toList()` now receives a finite sequence and returns.

**Explanation:** Kotlin sequences are lazy; each operator (including `filter`) just wraps the upstream and pulls elements on demand. `toList()` is the terminal operator that starts pulling. Because the upstream `while (true)` loop never exits, `toList()` will keep requesting elements indefinitely. `take(count)` inserts a counter: after `count` elements pass through it raises an internal `done` flag and the iteration stops cleanly. A related pitfall is placing `take()` before a `filter` — if the filter is selective, you may receive fewer than `count` results because `take` counts raw elements before filtering. Here the filter is placed first so `take(count)` counts only the already-filtered business-day dates, which is the correct behaviour.

---

### Issue 2: `count` parameter silently unused

**Problem:** The method signature promises the caller that exactly `count` dates will be returned, but the original code ignores `count` entirely. Any call site that relies on the list length (e.g. rendering a table with exactly `count` rows) would never see the bug at compile time, and at runtime the thread simply hangs before returning anything.

**Fix:** The `.take(count)` added at CHANGE 2 is the sole consumer of the `count` parameter. After the fix, `count` flows directly into `take()`, so the parameter is used and the return value matches the caller's expectation.

**Explanation:** Kotlin does not warn about unused parameters on non-private methods because they are part of the public API contract. The compiler had no mechanism to flag this, so the omission survived compilation and code review. The fix is the same single-line change as Issue 1 — both issues are resolved by the same `take(count)` insertion — but they represent distinct failure modes: one is a liveness bug (the thread hangs) and the other is a correctness/contract bug (the parameter is ignored). A static analysis tool such as detekt with the `UnusedParameter` rule would have caught this before it reached production.
