---
slug: generator-return-value-ignored
track: javascript
orderIndex: 18
title: Generator Return Value Never Read
difficulty: hard
tags:
  - async
  - correctness
  - api-misuse
language: javascript
---

## Context

This pagination utility lives in `src/lib/paginate.js`. It uses an async generator to lazily fetch pages of results from a REST API and yield individual records to callers. The generator is consumed in a background ETL job that processes records and writes them to a data warehouse.

The ETL job occasionally terminates early when an upstream signal indicates the warehouse is at capacity. To handle this the job calls `iterator.return()` to close the generator and then logs a summary. However, operators see that the cleanup code inside the generator's `finally` block — which is supposed to call `api.closeSession(sessionId)` — is sometimes not executed, leaving dangling sessions on the API server.

The team confirmed that `iterator.return()` is being called correctly from the outside. They added logging and found the `finally` block is reached, but `api.closeSession` is not always awaited.

## Buggy code

```javascript
async function* fetchAllRecords(endpoint, pageSize = 100) {
  let cursor = null;
  const sessionId = await api.openSession(endpoint);
  try {
    while (true) {
      const page = await api.fetchPage(sessionId, cursor, pageSize);
      for (const record of page.items) {
        yield record;
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
  } finally {
    await api.closeSession(sessionId);
  }
}

async function runETL(endpoint) {
  const iterator = fetchAllRecords(endpoint);
  for await (const record of iterator) {
    const shouldStop = await warehouse.write(record);
    if (shouldStop) {
      iterator.return(); // signal generator to stop
      break;
    }
  }
  console.log('ETL complete');
}
```
