---
slug: async-generator-missing-return-check
track: javascript
orderIndex: 14
title: Generator Return Ignored in Pipeline
difficulty: medium
tags:
  - async
  - types
  - control-flow
language: typescript
---

## Context

This file is `src/etl/csv-pipeline.ts`, part of an internal ETL service that reads large CSV uploads, transforms each row, and inserts records into PostgreSQL in batches. To avoid loading the entire file into memory, the pipeline uses an async generator to lazily pull rows from a `Readable` stream.

When a user uploads a file with a validation error mid-stream, the pipeline is supposed to abort early, log the offending row, and roll back any partial inserts. Instead, operators notice that the pipeline always processes the entire file — even when the generator is supposed to stop — and partial inserts are committed rather than rolled back.

Adding `console.log` before the `yield` confirms that rows continue to be produced even after the consumer breaks out of the loop. The PostgreSQL rollback code is never reached because execution never leaves the generator consumer cleanly.

## Buggy code

```typescript
async function* csvRows(stream: NodeJS.ReadableStream): AsyncGenerator<string[]> {
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) yield line.split(',');
    }
  }
  if (buffer.trim()) yield buffer.split(',');
}

async function runPipeline(stream: NodeJS.ReadableStream, db: DbClient) {
  const trx = await db.beginTransaction();
  try {
    for await (const row of csvRows(stream)) {
      const valid = validateRow(row);
      if (!valid) {
        console.error('Invalid row, aborting', row);
        break;
      }
      await trx.insertRow(row);
    }
    await trx.commit();
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}
```
