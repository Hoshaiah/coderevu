## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Infinite Sequence in flatMap Hangs
// ------------------------------------------------------------------------

data class ReportSection(val id: String, val type: String, val pageCount: Int = 5)
data class Page(val sectionId: String, val pageNumber: Int, val content: String)

fun generatePages(section: ReportSection): Sequence<Page> {
    return if (section.type == "APPENDIX") {
        // CHANGE 1: Replace the unbounded `generateSequence(1) { it + 1 }` with a finite range limited to `section.pageCount` so `toList()` terminates instead of spinning forever.
        (1..section.pageCount).asSequence().map { pageNum ->
            Page(section.id, pageNum, "Appendix page $pageNum")
        }
    } else {
        (1..5).asSequence().map { pageNum ->
            Page(section.id, pageNum, "Page $pageNum of ${section.id}")
        }
    }
}

fun buildReport(sections: List<ReportSection>): List<Page> {
    return sections.asSequence()
        .flatMap { generatePages(it) }
        .toList()
}
```

## Explanation

### Issue 1: Infinite Sequence Prevents `toList()` From Completing

**Problem:** Any report that contains an `APPENDIX` section causes `buildReport` to hang indefinitely. One CPU core runs at 100% while memory stays flat. The process never returns a result.

**Fix:** Replace `generateSequence(1) { it + 1 }` in the `APPENDIX` branch with `(1..section.pageCount).asSequence()`, and add a `pageCount` field (defaulting to `5`) to `ReportSection` so the range has a finite upper bound.

**Explanation:** `generateSequence(1) { it + 1 }` produces integers 1, 2, 3, … with no stopping condition — it is an infinite sequence. When `flatMap` pulls elements from it, it keeps yielding pages forever. `toList()` must exhaust the sequence before it can return, so it loops endlessly consuming CPU without allocating new memory (which is why memory stays flat). The fix makes the APPENDIX branch emit exactly `section.pageCount` pages, matching the finite behaviour of every other section type. A related pitfall: even lazily composing an infinite sequence with `take(n)` would work, but putting the bound on the data source (`ReportSection.pageCount`) is safer because it prevents any caller — not just `buildReport` — from accidentally pulling unlimited pages.

---

### Issue 2: No Bound Parameter on `generatePages` for APPENDIX Type

**Problem:** The original `generatePages` signature accepts only a `ReportSection` but provides no way to control how many pages an APPENDIX section produces. This means any future caller that wants a finite APPENDIX sequence must implement its own `take()` guard, which is easy to forget.

**Fix:** Add `val pageCount: Int = 5` to the `ReportSection` data class and use `section.pageCount` as the upper bound of the range inside `generatePages`, so the page count is carried with the data and automatically respected everywhere `generatePages` is called.

**Explanation:** When page-count logic lives inside `generatePages` as a hard-coded infinite generator, every call site that materialises the result (e.g. via `toList()`, `forEach`, or `count()`) is at risk of hanging if it forgets to add a `take()`. Encoding the limit in `ReportSection` keeps the constraint co-located with the data it describes, and the default value `5` preserves backward-compatible behaviour for existing callers that don't set `pageCount` explicitly. If the page count later needs to come from a database or config, only `ReportSection` construction needs to change — `generatePages` stays correct automatically.
