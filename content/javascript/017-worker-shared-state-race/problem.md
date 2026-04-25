---
slug: worker-shared-state-race
track: javascript
orderIndex: 17
title: Shared Counter Race in Worker
difficulty: hard
tags:
  - async
  - correctness
  - javascript
language: javascript
---

## Context

This module lives in `src/jobs/importWorker.js`, a Node.js worker thread used to process CSV import jobs. Multiple import jobs can run concurrently in the same worker pool. The `processRow` function calls an async validator, and the worker tracks `successCount` and `errorCount` globally to report job statistics at the end.

Operators report that the final statistics logged by the worker are consistently lower than the actual number of processed rows. For example, a 1000-row import logs `"Processed 947 rows"` even though all 1000 rows are visible in the database. The discrepancy grows with larger imports and higher concurrency, suggesting a race condition.

The team confirmed the database writes are correct (all rows are actually inserted). The bug is specifically in the counter tracking. They added extra logging per row and verified each row increments a counter, but the final total is still wrong.

## Buggy code

```javascript
const { workerData, parentPort } = require("worker_threads");
const { validateRow } = require("./validators");
const { insertRow } = require("./db");

let successCount = 0;
let errorCount = 0;

async function processRow(row) {
  const isValid = await validateRow(row);
  if (!isValid) {
    errorCount++;
    return;
  }
  await insertRow(row);
  successCount++;
}

async function run() {
  const { rows } = workerData;

  await Promise.all(rows.map((row) => processRow(row)));

  parentPort.postMessage({
    success: successCount,
    errors: errorCount,
    total: successCount + errorCount,
  });
}

run().catch((err) => parentPort.postMessage({ error: err.message }));
```
