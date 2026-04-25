## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — typeof null Passes Object Check
// ------------------------------------------------------------------------

function deepClone(value) {
  // CHANGE 1: Added explicit null check — typeof null is "object" in JS, so null would slip past the typeof guard and crash at Object.keys(null).
  if (value === null || typeof value !== "object" || typeof value === "function") {
    // primitive, null, or function — return as-is
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(deepClone);
  }

  // plain object
  const clone = {};
  for (const key of Object.keys(value)) {
    clone[key] = deepClone(value[key]);
  }
  return clone;
}
```

## Explanation

### Issue 1: `null` Bypasses the Object Guard

**Problem:** When `deepClone(null)` is called, the guard `typeof value !== "object"` evaluates to `false` because `typeof null` returns `"object"` in JavaScript. So `null` is treated as a plain object, execution falls through to `Object.keys(null)`, and the runtime throws `TypeError: Cannot convert undefined or null to object`. In production this crashes the serialisation pipeline and returns a 500 to the client.

**Fix:** Add `value === null` as the first condition in the early-return guard at CHANGE 1, so the check becomes `if (value === null || typeof value !== "object" || typeof value === "function")`. This makes `null` return immediately, identical to how a primitive is handled.

**Explanation:** `typeof null === "object"` is a long-standing quirk in JavaScript — it was a bug in the original implementation and was never corrected for backward compatibility. Any function that relies solely on `typeof` to distinguish objects from non-objects will misclassify `null`. The fix uses a strict equality check `value === null` before the `typeof` test, short-circuiting evaluation so `null` never reaches `Object.keys`. A related pitfall worth noting: other "object-like" values such as `Date`, `RegExp`, or `Map` instances also pass the `typeof` check but are not plain objects — if those types appear in the data, `Object.keys` will copy their enumerable own properties but lose their prototype identity, which may or may not be acceptable depending on how the clone is used.

---

### Issue 2: Unreachable Function Branch in Guard Condition

**Problem:** The condition `typeof value !== "object" || typeof value === "function"` has a logical redundancy. `typeof` returns `"function"` for functions, which means `typeof value !== "object"` is already `true` for any function — the second clause `typeof value === "function"` can never add new cases. The branch is dead code, which is misleading but also signals the author was trying to patch holes in the guard individually rather than thinking about the full set of values `typeof` returns.

**Fix:** The CHANGE 1 fix that adds `value === null` resolves the only real gap. The redundant `typeof value === "function"` clause is left in place because removing it is a no-op for correctness and keeps the diff minimal, but a reviewer should note it contributes nothing.

**Explanation:** `typeof` returns one of a fixed set of strings: `"undefined"`, `"boolean"`, `"number"`, `"bigint"`, `"string"`, `"symbol"`, `"function"`, or `"object"`. The only values where `typeof x === "object"` is `true` are actual objects and `null`. Because `"function" !== "object"`, any function value already satisfies `typeof value !== "object"` and hits the early return before the second clause is ever tested. Understanding the full return-value space of `typeof` upfront would have revealed that `null` was the only unhandled case, rather than leading to an incorrect assumption that adding a function check would somehow protect against `null`.
