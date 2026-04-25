## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Enum Reverse Mapping Unexpected Key
// ------------------------------------------------------------------------

enum OrderStatus {
  Pending = 0,
  Processing = 1,
  Shipped = 2,
  Delivered = 3,
}

function getValidStatuses(): string[] {
  // CHANGE 1: Filter out the numeric reverse-mapping keys that TypeScript adds for numeric enums; keep only the named string keys (e.g. 'Pending') by checking that the key cannot be coerced to a finite number.
  return Object.keys(OrderStatus).filter((key) => isNaN(Number(key)));
}

function validateStatus(input: string): boolean {
  const valid = getValidStatuses();
  return valid.includes(input);
}

// In the controller:
app.put('/orders/:id/status', (req, res) => {
  const { status } = req.body; // e.g. "Pending"
  if (!validateStatus(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  // ...
});
```

## Explanation

### Issue 1: Numeric Enum Reverse-Mapping Pollutes Key List

**Problem:** TypeScript compiles a numeric enum into a JavaScript object that has entries in both directions: `OrderStatus['Pending'] === 0` and `OrderStatus[0] === 'Pending'`. Calling `Object.keys(OrderStatus)` on that compiled object returns `['0', '1', '2', '3', 'Pending', 'Processing', 'Shipped', 'Delivered']`. The validation logic then works against this inflated array, and while `'Pending'` is technically present, the array also accepts `'0'`, `'1'`, etc. as valid inputs — meaning a client can pass the raw number string `'0'` and it will pass validation, which is unintended behavior that can mask real input errors.

**Fix:** In `getValidStatuses`, chain `.filter((key) => isNaN(Number(key)))` onto `Object.keys(OrderStatus)` so that only the human-readable name keys survive and the stringified numeric reverse-mapping keys are dropped.

**Explanation:** When TypeScript compiles `enum OrderStatus { Pending = 0 }`, the emitted JavaScript is roughly `{ Pending: 0, 0: 'Pending' }`. That bidirectional structure is intentional — it lets you look up the name from a numeric value at runtime — but it means `Object.keys()` sees twice as many entries as you expect. `isNaN(Number(key))` returns `true` for `'Pending'` (not a number) and `false` for `'0'` (a valid number), so the filter keeps only the named keys. A related pitfall: if you later add a string enum member (e.g., `Cancelled = 'CANCELLED'`), TypeScript does NOT add a reverse-mapping entry for it, so the filter remains safe — `isNaN(Number('Cancelled'))` is `true` and the key is kept.

---

### Issue 2: Numeric Strings Accepted as Valid Status Values

**Problem:** Because the unfiltered key list includes `'0'`, `'1'`, `'2'`, and `'3'`, a client that accidentally (or maliciously) sends `status: '0'` instead of `status: 'Pending'` passes validation. The API contract intends to accept only named strings, but the validator silently allows raw numeric strings.

**Fix:** The same `isNaN(Number(key))` filter in `getValidStatuses` that addresses Issue 1 also resolves this: once the numeric strings are excluded from `validStatuses`, `valid.includes('0')` returns `false` and those requests are correctly rejected.

**Explanation:** The two problems share one root cause (the reverse-mapping keys in `Object.keys()`), but they represent distinct failure modes: one is a false negative for valid names (the ops-reported 400 errors), and the other is a false positive for numeric strings. Fixing `getValidStatuses` to return only named keys solves both at once. If the team ever needs to accept numeric status codes from a different client, that should be an explicit separate code path, not an accidental side effect of how the enum compiles.
