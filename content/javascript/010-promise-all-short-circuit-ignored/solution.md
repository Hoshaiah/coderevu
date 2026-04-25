## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Partial Failure Silently Ignored
// ------------------------------------------------------------------------

async function syncInventory(skus) {
  const results = await Promise.allSettled(
    skus.map((sku) => fetchWarehouseCount(sku))
  );

  // CHANGE 1: Separate fulfilled and rejected results instead of mapping all results blindly — `result.value` is undefined for rejected promises, so the old code silently used 0.
  const updates = [];
  const failures = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      // CHANGE 1: Only push SKUs whose promise fulfilled, using `result.value` which is only valid here.
      updates.push({ sku: skus[index], count: result.value });
    } else {
      // CHANGE 2: Collect failures and log them instead of silently writing count 0 to the DB.
      failures.push({ sku: skus[index], reason: result.reason });
    }
  });

  // CHANGE 2: Log each failed SKU so operators can see which SKUs did not sync rather than getting stale data with no warning.
  if (failures.length > 0) {
    failures.forEach(({ sku, reason }) =>
      console.error(`Sync failed for SKU ${sku}: ${reason?.message ?? reason}`)
    );
  }

  if (updates.length > 0) {
    await db.inventory.bulkUpdate(updates);
  }

  console.log(
    `Sync completed: ${updates.length}/${skus.length} SKUs updated, ${failures.length} failed`
  );
}

async function fetchWarehouseCount(sku) {
  const res = await fetch(`https://warehouse.example.com/inventory/${sku}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for SKU ${sku}`);
  const data = await res.json();
  return data.count;
}
```

## Explanation

### Issue 1: Rejected result property read incorrectly

**Problem:** When `Promise.allSettled` settles a rejected promise, the result object has `{ status: 'rejected', reason: <error> }` — there is no `.value` property. The original code reads `result.value ?? 0` for every result regardless of status, so for every failed SKU `result.value` is `undefined` and the nullish-coalescing operator substitutes `0`. The database gets updated with a count of 0 for that SKU, making inventory look empty.

**Fix:** The `results.forEach` block now checks `result.status === 'fulfilled'` before reading `result.value`. Only fulfilled results are added to `updates` via `result.value`, which is guaranteed to exist and be correct at that branch.

**Explanation:** `Promise.allSettled` always resolves (never rejects) and yields one descriptor per input promise. A fulfilled descriptor carries `.value`; a rejected one carries `.reason`. Reading `.value` on a rejected descriptor yields `undefined` because the property simply does not exist on that object shape. The `?? 0` fallback then replaces `undefined` with `0`, which looks like valid data to `bulkUpdate`. The fix gates on `.status` so the two shapes are never confused. A related pitfall: `Promise.all` would have thrown on the first rejection and skipped all remaining updates entirely — `allSettled` is the right primitive here, but only when you actually branch on `status`.

---

### Issue 2: Failures silently written as zero instead of skipped and reported

**Problem:** Because every SKU — including failed ones — ends up in `updates`, the `bulkUpdate` call overwrites the previously-correct DB value with 0. Operators see `"Sync completed: 100 SKUs"` in the logs and have no indication that any SKU failed, so stale or zeroed inventory goes unnoticed until a manual audit.

**Fix:** Failed results are collected into a `failures` array. Each failure is logged with `console.error` including the SKU and error message. The `bulkUpdate` call only receives the `updates` array (fulfilled SKUs), and the completion log now reports how many succeeded vs. failed.

**Explanation:** The original code's `results.map(...)` produces an entry for every input index unconditionally, coupling the error-handling gap in Issue 1 to a second problem: even if you noticed the wrong property name and switched to a sentinel value, you would still be writing that sentinel to the database for every erroring SKU. Skipping failed SKUs from `updates` means the DB retains whatever the last good value was, which is always preferable to a fabricated 0. Logging with `console.error` makes failures visible to the on-call operator and to any log-aggregation pipeline watching stderr. The updated summary line gives a quick ratio so the operator knows at a glance whether the run was mostly healthy or mostly broken.
