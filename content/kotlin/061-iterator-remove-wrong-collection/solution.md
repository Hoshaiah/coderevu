## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Iterator Remove on Wrong Collection
// ------------------------------------------------------------------------

class DuplicateFilter(private val maxSize: Int = 10_000) {

    private val seen = LinkedHashSet<String>()
    private val window = ArrayDeque<String>()

    fun accept(id: String): Boolean {
        if (seen.contains(id)) return false
        seen.add(id)
        window.addLast(id)
        if (window.size > maxSize) {
            evictOldest()
        }
        return true
    }

    private fun evictOldest() {
        val iter = window.iterator()
        if (iter.hasNext()) {
            // CHANGE 1: capture the ID returned by next() so we can remove it from both collections
            val oldest = iter.next()
            iter.remove()
            // CHANGE 2: also remove the evicted ID from seen; without this the seen set never shrinks
            seen.remove(oldest)
        }
    }
}
```

## Explanation

### Issue 1: Evicted ID never removed from seen set

**Problem:** Every time `evictOldest` runs it removes one entry from `window`, but the corresponding entry in `seen` is never touched. Over time `seen` accumulates every ID that was ever accepted and never releases any of them, eventually exhausting heap memory.

**Fix:** Store the return value of `iter.next()` in a local variable `oldest`, then call `seen.remove(oldest)` after `iter.remove()` so both collections stay in sync.

**Explanation:** `iter.next()` both advances the iterator and returns the element it just moved past. The buggy code ignores that return value, so the element identity is lost before `seen` can be updated. Because `seen` is the structure used for O(1) duplicate checks, it must mirror the window: every ID added to `seen` when `accept` is called should be removed from `seen` when that same ID is evicted from `window`. Capturing `oldest = iter.next()` preserves the reference for the `seen.remove(oldest)` call. A related pitfall: if you remove entries directly from `seen` while iterating `seen`, you'd need a separate iterator or `seen.iterator().remove()`; iterating `window` and using its iterator to remove from `window` while calling `seen.remove` directly is safe because you are not iterating `seen`.

---

### Issue 2: Return value of iter.next() discarded

**Problem:** The original code calls `iter.next()` as a standalone statement, throwing away the returned element. There is no local variable holding the ID, so there is no way to reference it afterward for the `seen.remove` call.

**Fix:** Replace the bare `iter.next()` call with `val oldest = iter.next()` so the evicted ID is available on the next line when `seen.remove(oldest)` is called.

**Explanation:** In Kotlin (and Java) `Iterator.next()` returns the element it advances past; ignoring that return value is legal but means the value is gone. Without assigning it, any subsequent code that needs to act on that specific element has no handle to it. Assigning it to `oldest` costs nothing at runtime — the JIT will keep it in a register — and makes the intent explicit: "the thing I just removed from the window is the same thing I need to remove from seen". This pattern appears whenever you maintain two parallel data structures that must stay consistent during eviction.
