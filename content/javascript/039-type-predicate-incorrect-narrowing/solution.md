## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Wrong Type Predicate Passes Bad Data
// ------------------------------------------------------------------------

interface WebhookPayload {
  orderId: string;
  amount: number;
  currency: string;
  status: 'paid' | 'failed' | 'refunded';
}

const VALID_STATUSES = ['paid', 'failed', 'refunded'] as const;

function isWebhookPayload(value: unknown): value is WebhookPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['orderId'] === 'string' &&
    // CHANGE 1: added check for `amount` being a finite number so payloads missing `amount` are rejected before reaching `.toFixed(2)`
    typeof v['amount'] === 'number' &&
    isFinite(v['amount'] as number) &&
    typeof v['currency'] === 'string' &&
    // CHANGE 2: replaced loose `typeof === 'string'` with an explicit allowlist check so only the three union members are accepted
    VALID_STATUSES.includes(v['status'] as typeof VALID_STATUSES[number])
  );
}

export function processWebhook(raw: unknown) {
  if (!isWebhookPayload(raw)) {
    throw new Error('Invalid webhook payload');
  }
  // TypeScript thinks `raw` is WebhookPayload here
  const total = raw.amount.toFixed(2);
  return { orderId: raw.orderId, total };
}
```

## Explanation

### Issue 1: Missing `amount` field check

**Problem:** A webhook payload that has no `amount` property passes `isWebhookPayload` and is forwarded to `processWebhook`. When the handler calls `raw.amount.toFixed(2)`, `raw.amount` is `undefined`, and the process throws `TypeError: Cannot read properties of undefined`. This is the crash the team saw in staging.

**Fix:** Two lines are added inside the `return` expression of `isWebhookPayload`: `typeof v['amount'] === 'number'` and `isFinite(v['amount'] as number)`. Both must be true for the guard to return `true`.

**Explanation:** TypeScript's type system trusts whatever the programmer writes in the return expression of a type predicate function — it does not verify that the checks are complete. So `value is WebhookPayload` is accepted even though `amount` is never tested. At runtime, a JSON body without `amount` sets `v['amount']` to `undefined`, which satisfies none of the existing checks but is never evaluated, so the function returns `true` anyway. Adding `typeof v['amount'] === 'number'` closes the gap. The extra `isFinite` guard rejects `NaN` and `Infinity`, both of which pass `typeof === 'number'` but would produce surprising results from `.toFixed(2)` (`"NaN"` and `"Infinity"`).

---

### Issue 2: Status check does not enforce the union

**Problem:** The guard only confirms that `v['status']` is some string. A payload with `status: 'pending'` or `status: ''` passes validation and is typed as `WebhookPayload`, even though those values are not members of `'paid' | 'failed' | 'refunded'`. Any downstream `switch` or conditional that exhaustively handles the three union members will silently fall through or hit an unexpected branch.

**Fix:** A `const VALID_STATUSES` tuple is declared with `as const`, and the guard replaces `typeof v['status'] === 'string'` with `VALID_STATUSES.includes(v['status'] as typeof VALID_STATUSES[number])`. This rejects any string not in the union at runtime.

**Explanation:** `typeof x === 'string'` narrows the TypeScript type to `string`, not to a specific string literal union. The compiler accepts this inside a type predicate because it cannot prove the set of valid values from a `typeof` check alone — that information simply is not encoded in the check. Using an allowlist array with `.includes()` actually tests the value against each member of the union at runtime, mirroring what the TypeScript type declares. One related pitfall: if the union gains a fourth status later (e.g. `'chargeback'`), the developer must remember to add it to `VALID_STATUSES` as well, since the compiler will not automatically flag the mismatch between the array and the interface.
