---
slug: promise-all-short-circuit-ignored
track: javascript
orderIndex: 10
title: Partial Failure Silently Ignored
difficulty: medium
tags:
  - async
  - error-handling
  - promises
language: javascript
---

## Context

This background job lives in `jobs/syncInventory.js`. It fetches inventory counts for a batch of SKUs from a third-party warehouse API and writes the results to the local database. The job runs every 5 minutes via a cron scheduler.

Operators notice that inventory counts in the database are sometimes stale for certain SKUs — hours after a warehouse update, the old value is still showing. The job's log shows `"Sync completed: 100 SKUs"` with no errors. The warehouse API occasionally returns `503` errors for individual SKUs during high-traffic periods.

The team added per-SKU logging and confirmed the API does return errors for some SKUs. They assumed `Promise.allSettled` would be the fix but misread the results array and are still silently swallowing failures.

## Buggy code

```javascript
async function syncInventory(skus) {
  const results = await Promise.allSettled(
    skus.map((sku) => fetchWarehouseCount(sku))
  );

  const updates = results.map((result, index) => ({
    sku: skus[index],
    count: result.value ?? 0,
  }));

  await db.inventory.bulkUpdate(updates);
  console.log(`Sync completed: ${skus.length} SKUs`);
}

async function fetchWarehouseCount(sku) {
  const res = await fetch(`https://warehouse.example.com/inventory/${sku}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for SKU ${sku}`);
  const data = await res.json();
  return data.count;
}
```
