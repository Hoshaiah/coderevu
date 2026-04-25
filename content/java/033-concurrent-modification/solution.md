## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Removing from a list while iterating throws ConcurrentModificationException
// ------------------------------------------------------------------------
import java.util.ArrayList;
import java.util.List;
import java.util.Iterator;
import java.time.Instant;

public class SessionCache {
    private final List<Session> sessions = new ArrayList<>();

    public void purgeExpired(Instant now) {
        // CHANGE 1: Use an explicit Iterator instead of enhanced-for so that iterator.remove() is used, which updates modCount safely and avoids
        // ConcurrentModificationException. Also fixes CHANGE 2: iterator.remove()
        // never skips elements because the cursor is managed by the iterator itself.
        Iterator<Session> it = sessions.iterator();
        while (it.hasNext()) {
            Session s = it.next();
            if (s.expiresAt().isBefore(now)) {
                // CHANGE 2: Call it.remove() instead of sessions.remove(s) so that every expired session is removed without skipping the next element.
                it.remove();
            }
        }
    }
}
```

## Explanation

### Issue 1: Direct list mutation during enhanced-for iteration

**Problem:** The enhanced-for loop internally creates an `ArrayList.Itr` iterator. Every call to `sessions.remove(s)` increments the list's `modCount`. On the next call to `it.next()`, the iterator compares the current `modCount` against the value it captured at construction; when they differ, it throws `ConcurrentModificationException`. In production this happens on the very first expired session it finds.

**Fix:** Replace the enhanced-for loop with an explicit `Iterator<Session>` obtained via `sessions.iterator()`, and call `it.remove()` instead of `sessions.remove(s)`. The iterator's own `remove()` method updates both the backing list and the iterator's internal `expectedModCount` atomically, so no mismatch is ever detected.

**Explanation:** `ArrayList` tracks structural mutations with an integer field `modCount`. `ArrayList.Itr.next()` checks `modCount == expectedModCount` on every call and throws if they differ — this is a deliberate fail-fast guard. `sessions.remove(s)` goes through the list's public API, incrementing `modCount`, but the iterator has no way to know about it. `Iterator.remove()` is the one sanctioned path: it calls the same internal removal logic but then writes the new `modCount` back into `expectedModCount`, keeping everything in sync. A related pitfall: even if you caught or suppressed the exception, the iterator cursor would be in an undefined state after an external remove, so subsequent `next()` calls might return wrong elements.

---

### Issue 2: Skipped elements when removing with index-based remove during iteration

**Problem:** When `sessions.remove(s)` removes an element at index `i`, all subsequent elements shift left by one. The iterator's internal cursor has already advanced past index `i`, so the element that was at index `i+1` (now at `i`) is never visited. If two consecutive sessions are both expired, the second one is silently left in the cache.

**Fix:** `it.remove()` removes the element the iterator most recently returned and then adjusts the iterator's cursor to compensate for the shift, so the next `it.next()` call correctly lands on the element that followed the removed one. No element is skipped.

**Explanation:** `ArrayList.Itr` stores a `cursor` field pointing to the index of the next element to return. After `it.next()` returns the element at index `i`, `cursor` is `i+1`. If you call `sessions.remove(s)` externally, the list shifts everything from `i+1` onward left by one, but `cursor` stays at `i+1`, so it now points to what was `i+2` — the element at the new `i+1` is skipped. `Iterator.remove()` decrements `cursor` after removal, compensating exactly for the shift. This means even a run of many consecutive expired sessions is handled correctly.
