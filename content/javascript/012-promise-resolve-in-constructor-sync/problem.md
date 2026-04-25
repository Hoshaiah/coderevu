---
slug: promise-resolve-in-constructor-sync
track: javascript
orderIndex: 12
title: Sync Exception Escapes Promise Chain
difficulty: medium
tags:
  - async
  - promises
  - error-handling
language: javascript
---

## Context

This code lives in `workers/importJob.js` and is part of a nightly ETL pipeline that imports CSV files from an S3 bucket. Each job is kicked off by calling `runImport`, whose returned Promise is caught by a top-level `.catch` that logs failures and marks the job as failed in the database.

Operators notice that roughly 2% of import jobs cause the Node.js process to crash with an unhandled exception rather than being gracefully logged as failed. The crash always traces to the JSON parsing step inside `runImport`. The top-level `.catch` handler is confirmed working for network errors and file-not-found cases — only the parse failure escapes it.

The developer verified that the JSON parse throws synchronously and assumed wrapping the whole function in a `new Promise()` executor would catch it.

## Buggy code

```javascript
const fs = require("fs/promises");

function parseManifest(raw) {
  // May throw SyntaxError synchronously for malformed JSON
  return JSON.parse(raw);
}

function runImport(jobId, s3Path) {
  return new Promise(async (resolve, reject) => {
    const raw = await fs.readFile(s3Path, "utf8");
    const manifest = parseManifest(raw); // throws synchronously
    const records = manifest.records;
    resolve(records.length);
  });
}

// Top-level usage
runImport("job-42", "/tmp/manifest.json")
  .then((count) => console.log(`Imported ${count} records`))
  .catch((err) => console.error("Job failed:", err.message));
```
