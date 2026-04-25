## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — toFixed Returns String, Not Number
// ------------------------------------------------------------------------

/**
 * @param {number} basePrice - price in dollars
 * @param {number} discountPct - e.g. 10 for 10% off
 * @returns {number} final price rounded to 2 decimal places
 */
function applyDiscount(basePrice, discountPct) {
  const discounted = basePrice - (basePrice * discountPct) / 100;
  // CHANGE 1: Wrap toFixed() with parseFloat() so the function returns a number, not a string — prevents string concatenation downstream.
  const rounded = parseFloat(discounted.toFixed(2));
  return rounded;
}

function formatPrice(price) {
  // CHANGE 2: Remove the extra .toFixed(2) call — applyDiscount already returns a rounded number, so just interpolate it directly.
  return `$${applyDiscount(price.base, price.discountPct)}`;
}

module.exports = { applyDiscount, formatPrice };
```

## Explanation

### Issue 1: `toFixed` Returns String Instead of Number

**Problem:** `applyDiscount` is documented to return a `number`, but `toFixed()` always returns a `string`. Any caller that treats the result as a number — including the payment processor receiving `"45.005.00"` — gets a string instead, leading to string concatenation bugs and rejected charges.

**Fix:** Wrap the `toFixed(2)` call with `parseFloat(...)` at the `CHANGE 1` site, so `rounded` is a proper JavaScript `number` before it is returned.

**Explanation:** `Number.prototype.toFixed()` is a formatting method — its return type is always `string`. When `formatPrice` then calls `.toFixed(2)` on that string (`"45.00".toFixed(2)`), JavaScript promotes the string to a `Number` object... except strings don't have `.toFixed`, so the runtime falls back to calling `String.prototype.toFixed` which doesn't exist, and the result is `undefined` — which gets coerced to the string `"undefined"`. In practice what users saw (`"45.005.00"`) is what happens when the string `"45.00"` is concatenated with the literal `".toFixed(2)"` result in older or lax environments. Using `parseFloat` converts the correctly-rounded string back to a `number`, preserving two decimal places of precision while restoring the correct type. A related pitfall: don't use `Number()` here instead of `parseFloat()` — both work for this input, but `parseFloat` is idiomatic for this pattern and handles edge cases like leading/trailing whitespace that `Number()` also handles, so either is fine, but the intent is clearer with `parseFloat`.

---

### Issue 2: Double `.toFixed(2)` Call in `formatPrice`

**Problem:** `formatPrice` calls `.toFixed(2)` on the value returned by `applyDiscount`. Before the Issue 1 fix, this meant calling `.toFixed(2)` on a string (`"45.00"`), which in most JS engines is `undefined` or throws, producing the malformed output `"$45.005.00"` seen in the UI.

**Fix:** Remove the `.toFixed(2)` call at the `CHANGE 2` site in `formatPrice`, and interpolate the return value of `applyDiscount` directly into the template literal.

**Explanation:** Once `applyDiscount` correctly returns a `number` rounded to two decimal places, there is no need to call `.toFixed(2)` again in `formatPrice` — the rounding already happened. Calling `.toFixed(2)` on the string `"45.00"` (the old buggy return value) does not invoke `Number.prototype.toFixed`; strings have no such method, so the call returns `undefined`, and the template literal becomes `"$45.00undefined"` or similar garbage. Removing the redundant call keeps `formatPrice` clean: it just formats the already-correct number into a display string. If display formatting ever needs to change (e.g., locale-aware formatting with `toLocaleString`), that change belongs here in `formatPrice`, not in `applyDiscount`, keeping the two concerns separated.
