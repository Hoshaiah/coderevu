## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — WeakMap Keyed on Primitive
// ------------------------------------------------------------------------

const tooltipMeta = new WeakMap();

function registerTooltip(nodeOrId, options) {
  // CHANGE 1: resolve string IDs to their DOM element so WeakMap receives an object, not a primitive
  const key = typeof nodeOrId === 'string'
    ? document.getElementById(nodeOrId)
    : nodeOrId;

  // CHANGE 2: guard against a null element (ID not found in DOM) to give a clear error instead of a silent WeakMap TypeError
  if (!key) {
    throw new Error(`registerTooltip: no element found for id "${nodeOrId}"`);
  }

  if (tooltipMeta.has(key)) {
    return tooltipMeta.get(key);
  }

  const meta = {
    content: options.content,
    placement: options.placement ?? 'top',
    createdAt: Date.now(),
  };

  tooltipMeta.set(key, meta);
  return meta;
}

function unregisterTooltip(nodeOrId) {
  // CHANGE 1: same fix applied here — resolve string to DOM element before using as WeakMap key
  const key = typeof nodeOrId === 'string'
    ? document.getElementById(nodeOrId)
    : nodeOrId;
  if (key) {
    tooltipMeta.delete(key);
  }
}
```

## Explanation

### Issue 1: WeakMap keyed on string primitive

**Problem:** When a caller passes a string like `'tooltip-anchor-42'` to `registerTooltip`, the ternary evaluates to the string itself (both branches return `nodeOrId` unchanged). `WeakMap` keys must be objects or registered symbols — passing a string throws `TypeError: Invalid value used as weak map key`, which crashes the tooltip initializer and leaves the tooltip unregistered.

**Fix:** Replace the identity branch `? nodeOrId` with `? document.getElementById(nodeOrId)` in both `registerTooltip` and `unregisterTooltip`. This resolves the string to the actual DOM `Element` object before it is used as the `WeakMap` key.

**Explanation:** A `WeakMap` holds *weak references* to its keys so the garbage collector can reclaim them when nothing else holds a reference — this only works with heap objects, not primitives like strings or numbers. The original ternary was written as if the two branches did different things, but both just returned the input unchanged, making the string branch a no-op that still produced a primitive. Calling `document.getElementById` returns the `HTMLElement` object (or `null` if the ID is absent), which is a valid weak key. Note that if the element does not exist yet (e.g., the script runs before the DOM is ready), `getElementById` returns `null`, which is also an invalid WeakMap key — the added null-check in CHANGE 2 surfaces this as a clear error instead of a confusing WeakMap TypeError.

---

### Issue 2: Missing guard for unresolved element (null key)

**Problem:** After fixing the string-to-element resolution, if the element ID does not exist in the document at the time of the call, `document.getElementById` returns `null`. Passing `null` to `WeakMap.has`, `WeakMap.get`, or `WeakMap.set` also throws `TypeError: Invalid value used as weak map key`, so the same crash surface persists under a different condition.

**Fix:** Add an explicit `if (!key) { throw new Error(...) }` guard immediately after the key is resolved in `registerTooltip`, and a `if (key)` check before `tooltipMeta.delete(key)` in `unregisterTooltip`.

**Explanation:** `null` is a primitive in JavaScript despite `typeof null === 'object'` being a long-standing quirk — WeakMap rejects it just like it rejects strings. Without the guard, a call like `registerTooltip('tooltip-anchor-99', opts)` where that ID does not exist in the DOM would silently fail or throw an opaque error. Throwing a descriptive error from `registerTooltip` makes the root cause (element not found) immediately visible in the console. In `unregisterTooltip` a silent skip is acceptable because there is nothing to clean up if the element never existed.
