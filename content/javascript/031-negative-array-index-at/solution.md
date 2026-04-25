## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Array at() vs Bracket Negative Index
// ------------------------------------------------------------------------

/**
 * Returns the last track in the playback queue.
 * @param {Array<{id: string, title: string, artist: string}>} queue
 */
function getLastTrack(queue) {
  if (queue.length === 0) {
    return null;
  }
  // CHANGE 1: Replace queue[-1] with queue.at(-1) — JavaScript objects treat -1 as a string key, not a reverse index, so queue[-1] always returns undefined; Array.prototype.at() is the correct API for negative indexing.
  return queue.at(-1);
}

module.exports = { getLastTrack };
```

## Explanation

### Issue 1: Negative Bracket Index Returns `undefined`

**Problem:** The sidebar intermittently shows blank or throws a `TypeError: Cannot read properties of undefined (reading 'title')`. This happens on every call with a non-empty queue because `queue[-1]` never returns the last element.

**Fix:** Replace `queue[-1]` with `queue.at(-1)` at the `return` statement. `Array.prototype.at()` is the standard method that accepts negative integers and resolves them relative to the array length.

**Explanation:** In JavaScript, arrays are objects and property keys are strings. Writing `queue[-1]` is the same as `queue["-1"]`, which looks up a property named the string `"-1"` on the array object. No such property exists unless someone explicitly assigned it, so the expression evaluates to `undefined` every time. `Array.prototype.at(-1)` was introduced precisely to fill this gap: it computes `queue[queue.length + (-1)]`, returning the actual last element. Because this bug fires on every invocation with a non-empty queue, the sidebar goes blank constantly despite the empty-array guard being correct. The one-item case may have appeared to work during manual testing only if the developer checked `queue[0]` elsewhere; it was never actually working via this code path.

---

### Issue 2: Missing Safe Return Value Reinforces `undefined` Leaking to Callers

**Problem:** Even with the bracket-index bug fixed, the function's contract says it returns either a track object or `null`, but before the fix it was returning `undefined` for all non-empty queues. Callers written to check `!== null` would not catch `undefined`, letting the `TypeError` propagate.

**Fix:** The fix at `CHANGE 1` (switching to `queue.at(-1)`) resolves this directly because `Array.prototype.at(-1)` on a non-empty array returns the actual element, making the `null` guard sufficient and consistent with the documented return type.

**Explanation:** When `queue[-1]` returned `undefined`, any caller doing `if (result === null) return;` would skip the guard and then crash on `result.title`. The `null` guard added by the previous developer was logically sound for empty arrays, but it never had a chance to matter because the real defect was that non-empty arrays also produced `undefined`. By using `queue.at(-1)`, the function now returns a valid track object for non-empty queues and `null` for empty ones, matching both the JSDoc contract and caller expectations. A related pitfall: if you ever need to support environments older than Node 16 or Safari 15, you would polyfill `Array.prototype.at` or fall back to `queue[queue.length - 1]`, which is the manual equivalent.
