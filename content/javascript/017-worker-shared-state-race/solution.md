## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Shared Counter Race in Worker
// ------------------------------------------------------------------------

const { workerData, parentPort } = require("worker_threads");
const { validateRow } = require("./validators");
const { insertRow } = require("./db");

async function run() {
  const { rows } = workerData;

  // CHANGE 1: Move counters inside run() so they are local to this job invocation, eliminating cross-job bleed and making the closure the sole owner of these variables during the job's lifetime.
  let successCount = 0;
  let errorCount = 0;

  // CHANGE 1: Define processRow inside run() so it closes over the local counters instead of the module-level globals, ensuring each job has its own independent counters.
  async function processRow(row) {
    const isValid = await validateRow(row);
    if (!isValid) {
      errorCount++;
      return;
    }
    await insertRow(row);
    successCount++;
  }

  // CHANGE 2: Collect per-row results as return values instead of relying on shared mutable state incremented inside concurrent async tasks, so that Promise.all can resolve all results before we tally them — eliminating the read-modify-write race where two tasks read the same stale counter value and one increment is lost.
  const results = await Promise.all(
    rows.map(async (row) => {
      const isValid = await validateRow(row);
      if (!isValid) {
        return { ok: false };
      }
      await insertRow(row);
      return { ok: true };
    })
  );

  // CHANGE 2: Derive final counts from the fully-resolved results array using a synchronous reduce, so there is no concurrent mutation and no lost increments.
  const successCount2 = results.filter((r) => r.ok).length;
  const errorCount2 = results.filter((r) => !r.ok).length;

  parentPort.postMessage({
    success: successCount2,
    errors: errorCount2,
    total: successCount2 + errorCount2,
  });
}

run().catch((err) => parentPort.postMessage({ error: err.message }));
```

## Explanation

### Issue 1: Module-level counters bleed across concurrent jobs

**Problem:** `successCount` and `errorCount` are declared at module scope, meaning every invocation of `run()` in the same worker thread shares and mutates the same variables. If the worker pool reuses a thread for a second job before the first has finished posting its message, the counters already contain counts from prior jobs, producing inflated or nonsensical totals.

**Fix:** At `CHANGE 1`, `successCount` and `errorCount` are moved inside `run()`, and `processRow` is redefined as a nested function that closes over those local variables. Each call to `run()` now owns its own isolated counter pair.

**Explanation:** Node.js worker threads can execute `run()` multiple times if the thread is pooled and reused. Module-level `let` variables persist for the lifetime of the module inside that thread. If job A starts, job B starts, and then both post their messages, both jobs are reading and writing the same two numbers. Moving the counters into the function scope means they are allocated fresh on each call and garbage-collected afterward, so concurrent or sequential jobs never share state.

---

### Issue 2: Read-modify-write race inside concurrent async tasks

**Problem:** `Promise.all` launches all `processRow` calls concurrently. Each call does `successCount++`, which is syntactic sugar for `successCount = successCount + 1`. When two tasks are both past their `await` point and both read `successCount` before either writes back, they each compute `oldValue + 1` and both write the same new value — one increment is silently lost. With 1000 concurrent rows this happens hundreds of times, explaining why the logged total is consistently lower than the real row count.

**Fix:** At `CHANGE 2`, the `rows.map` callback returns a `{ ok: boolean }` result object instead of mutating a shared counter. After `Promise.all` resolves, a synchronous `filter(...).length` tallies the counts from the completed, immutable results array.

**Explanation:** JavaScript is single-threaded but `async/await` creates interleaving: after each `await`, the event loop can run another continuation before the current one reaches `successCount++`. Two tasks can both resume from `await insertRow(row)` in the same event-loop turn if the promises resolve in the same microtask queue flush. Both read `successCount` as, say, `500`, both compute `501`, and both write `501` — net effect is one increment instead of two. Returning a value from each async task and aggregating after `Promise.all` moves all arithmetic to a single synchronous step where there is no interleaving, so every row is counted exactly once.
