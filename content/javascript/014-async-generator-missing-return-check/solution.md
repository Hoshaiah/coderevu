## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Generator Return Ignored in Pipeline
// ------------------------------------------------------------------------

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
  // CHANGE 2: track whether we should commit or roll back based on validation outcome
  let shouldCommit = true;
  try {
    const gen = csvRows(stream);
    for await (const row of gen) {
      const valid = validateRow(row);
      if (!valid) {
        console.error('Invalid row, aborting', row);
        // CHANGE 1: explicitly call gen.return() to trigger generator cleanup and destroy the underlying stream so no more rows are produced
        await gen.return(undefined);
        // CHANGE 2: mark the transaction for rollback instead of commit
        shouldCommit = false;
        break;
      }
      await trx.insertRow(row);
    }
    // CHANGE 2: only commit when all rows were valid; otherwise roll back the partial inserts
    if (shouldCommit) {
      await trx.commit();
    } else {
      await trx.rollback();
    }
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}
```

## Explanation

### Issue 1: Generator Not Terminated on Early Break

**Problem:** When `break` exits the `for await` loop after a bad row, the async generator's internal state is not explicitly closed. The `Readable` stream stays open and the generator keeps buffering incoming chunks. Operators see the pipeline consume the entire file even though the loop body stopped executing.

**Fix:** Hold a reference to the generator (`const gen = csvRows(stream)`) and call `await gen.return(undefined)` before `break`. This triggers the generator's implicit `finally` path, signals to the Node.js async iterator protocol that the consumer is done, and causes the `for await (const chunk of stream)` inside the generator to stop pulling chunks.

**Explanation:** A `for await...of` loop calls `iterator.return()` on the iterator automatically only when the loop throws — not when it exits via `break` in all runtimes consistently. Because `csvRows` is an async generator, it holds open the `for await (const chunk of stream)` loop inside it. Without calling `gen.return()`, that inner loop has no signal to stop; the stream keeps emitting `data` events that get buffered. Explicitly calling `gen.return(undefined)` closes the generator and propagates the termination signal inward, causing the stream read to stop. A related pitfall: if you are wrapping a stream that has no auto-close behaviour (e.g., a raw TCP socket), you may also need to call `stream.destroy()` — but for typical `Readable` file streams, `gen.return()` is sufficient because Node's stream iteration already handles cleanup when the async iterator is properly closed.

---

### Issue 2: Partial Inserts Committed After Validation Failure

**Problem:** After a bad row causes `break`, execution falls through to `await trx.commit()`. Any rows inserted before the failure are permanently written to PostgreSQL. The rollback code in the `catch` block is never reached because no exception is thrown — `break` is not an error.

**Fix:** Introduce a `shouldCommit` boolean flag, set it to `false` in the invalid-row branch, and replace the unconditional `await trx.commit()` with a conditional: `if (shouldCommit) { await trx.commit(); } else { await trx.rollback(); }`.

**Explanation:** The `catch` block only runs when the `try` body throws. A `break` statement exits the loop silently and continues executing the rest of the `try` block — including `trx.commit()`. The fix uses a flag rather than throwing an error because throwing would skip the explicit `gen.return()` call added in CHANGE 1 (or require a more complex `finally` arrangement). Setting `shouldCommit = false` keeps the control flow linear and makes the intent clear at the commit/rollback decision point. A related pitfall: if `trx.insertRow` or `trx.commit` throws after a partial insert, the `catch` block correctly calls `rollback` — so error-path rollback already works; only the break-path was missing.
