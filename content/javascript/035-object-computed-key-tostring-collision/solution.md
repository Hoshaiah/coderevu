## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Object Keys Silently Collide
// ------------------------------------------------------------------------

function rollupEvents(events) {
  const result = {};

  for (const event of events) {
    // CHANGE 1: Build the composite key with a separator that cannot appear in type or targetId; using JSON.stringify on each part prevents any ambiguity from implicit Array.toString coercion.
    const key = JSON.stringify(event.type) + '|' + JSON.stringify(event.targetId);
    if (result[key] === undefined) {
      result[key] = 0;
    }
    result[key] += 1;
  }

  return result;
}

// Example usage:
// rollupEvents([
//   { type: 'click', targetId: 42 },
//   { type: 'click,42', targetId: undefined },  // different combination!
// ])
// Now resolves to two distinct keys: '"click"|42' and '"click,42"|null'
```

## Explanation

### Issue 1: Array-to-string key coercion collapses distinct pairs

**Problem:** When a JavaScript array is used as an object property key, it is coerced to a string via `.toString()`, which joins elements with a comma and no escaping. `['click', 42]` and `['click,42', undefined]` both become the string `'click,42'`, so two different event combinations share one counter and the count is inflated.

**Fix:** Replace `const key = [event.type, event.targetId]` with `const key = JSON.stringify(event.type) + '|' + JSON.stringify(event.targetId)`, which quotes each field individually and separates them with `|`.

**Explanation:** JavaScript object keys must be strings. When you assign `result[[event.type, event.targetId]]`, V8 calls `.toString()` on the array, producing `event.type + ',' + String(event.targetId)`. If `event.type` itself contains a comma followed by digits that match another event's `targetId`, the resulting strings are identical even though the original data differs. `JSON.stringify` wraps string values in double-quotes, so `'click'` becomes `'"click"'` and `'click,42'` becomes `'"click,42"'` — the quotes make them unambiguous. The `|` pipe separator is an extra guard: even without JSON quoting, a pipe rarely appears in event type names, but combining both techniques makes collisions practically impossible. A related pitfall: `undefined` stringifies to `'undefined'` via Array.toString but to `null` via `JSON.stringify`, so be consistent in how you handle missing `targetId` values if downstream code parses the key back apart.

---

### Issue 2: No collision-safe delimiter in composite key construction

**Problem:** Even if you manually joined the fields — say `event.type + ',' + event.targetId` — any character you choose as a separator can legitimately appear inside `event.type` strings, leading to the same ambiguity. The summary table shows merged rows whenever the raw event data happens to contain that separator character.

**Fix:** `JSON.stringify` applied to each component (as introduced at the CHANGE 1 site) encloses string values in double-quotes and escapes any double-quotes inside them, so the serialized fields are self-delimiting and the `|` separator only needs to distinguish the two fields, not escape their contents.

**Explanation:** A composite key is only unambiguous if you can reconstruct the original parts from the key string. That requires either escaping the separator character wherever it appears in the parts, or encoding each part in a format that is itself unambiguous. `JSON.stringify` provides the second approach: a JSON string always starts and ends with `"`, and internal `"` characters are escaped as `\"`, so two adjacent JSON strings can be split at the unescaped `"` boundaries. The `|` pipe between them just makes the key human-readable in logs. An alternative that also works is `encodeURIComponent(type) + '|' + encodeURIComponent(targetId)`, which percent-encodes the `|` separator if it appears in either field.
