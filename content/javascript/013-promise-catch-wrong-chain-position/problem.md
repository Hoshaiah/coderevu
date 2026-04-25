---
slug: promise-catch-wrong-chain-position
track: javascript
orderIndex: 13
title: 'Catch Intercepts Success, Not Error'
difficulty: medium
tags:
  - async
  - promises
  - error-handling
language: javascript
---

## Context

This function lives in `src/jobs/importProducts.js`, a background job that imports product records from a CSV upload. After importing, it calls `notifyAdmin` to send a summary email. Errors during import should skip the notification and be logged instead.

In staging, the team noticed that `notifyAdmin` is called even when the import fails, and the logged error message is from `notifyAdmin` rather than from the original import failure. When the import succeeds but `notifyAdmin` throws a transient network error, the whole job appears to fail and is retried unnecessarily.

The team added console logs and confirmed that `importFromCsv` does reject correctly on bad input. They assumed Promise chaining would naturally route errors to the `catch` at the end.

## Buggy code

```javascript
const { importFromCsv } = require('./csvParser');
const { notifyAdmin } = require('./mailer');
const { logger } = require('./logger');

function runImportJob(fileBuffer, jobId) {
  return importFromCsv(fileBuffer)
    .then(
      (result) => notifyAdmin(`Job ${jobId} done: ${result.count} records`),
      (err) => logger.error(`Job ${jobId} failed during import:`, err)
    )
    .catch((err) => {
      logger.error(`Job ${jobId} notification failed:`, err);
    });
}

module.exports = { runImportJob };
```
