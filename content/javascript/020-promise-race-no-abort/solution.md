## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Promise.race Without Cancelling Loser
// ------------------------------------------------------------------------

import fetch from "node-fetch";

const PRIMARY_URL = "https://api.example.com/data";
const REPLICA_URL = "https://replica.example.com/data";

export async function fetchFastest(path: string): Promise<unknown> {
  // CHANGE 1: Use AbortControllers so whichever fetch loses the race gets cancelled, freeing its stream and connection.
  const primaryController = new AbortController();
  const replicaController = new AbortController();

  // CHANGE 1: Pass the signal into each fetch so it can be aborted programmatically.
  const primary = fetch(`${PRIMARY_URL}${path}`, { signal: primaryController.signal })
    .then((r) => r.json())
    // CHANGE 2: Suppress AbortError on the loser so an intentional cancellation never surfaces as an unhandled rejection.
    .catch((err: Error) => { if (err.name === "AbortError") return new Promise(() => {}); throw err; });

  const replica = fetch(`${REPLICA_URL}${path}`, { signal: replicaController.signal })
    .then((r) => r.json())
    // CHANGE 2: Same suppression on replica — the aborted loser must never reject the outer call.
    .catch((err: Error) => { if (err.name === "AbortError") return new Promise(() => {}); throw err; });

  // CHANGE 1: Wrap race so that whichever promise resolves first triggers an abort on the other controller.
  return new Promise((resolve, reject) => {
    let settled = false;

    function finish(winner: () => void, loserAbort: () => void) {
      if (settled) return;
      settled = true;
      loserAbort();
      winner();
    }

    primary
      .then((data) => finish(() => resolve(data), () => replicaController.abort()))
      .catch((err) => finish(() => reject(err), () => replicaController.abort()));

    replica
      .then((data) => finish(() => resolve(data), () => primaryController.abort()))
      .catch((err) => finish(() => reject(err), () => primaryController.abort()));
  });
}
```

## Explanation

### Issue 1: Losing fetch never cancelled, leaks streams

**Problem:** Every call fires two HTTP requests. `Promise.race` resolves as soon as one finishes, but the other request continues running in the background. The `Response` body — a `ReadableStream` — is never read or aborted, so Node.js keeps the stream object and the underlying TCP socket in memory. At hundreds of calls per second, these objects accumulate faster than GC can collect them, growing heap usage until the process is restarted.

**Fix:** Two `AbortController` instances are created, one per fetch. Each `fetch` call receives the corresponding `signal`. Inside a manually-constructed `Promise`, whichever fetch settles first calls `abort()` on the other controller via the `finish` helper, which cancels the in-flight request immediately.

**Explanation:** `Promise.race` only determines which promise wins; it has no mechanism to cancel the others. The losing `fetch` keeps its connection open, reading headers and buffering the body until the response completes. `AbortController.abort()` sends a cancellation signal that `node-fetch` forwards as an `AbortError`, causing the fetch to stop reading and release the socket back to the pool. Without this, each race leaves one dangling `ReadableStream` for the duration of that response, and at high throughput the heap fills with them. The `settled` flag prevents a double-resolution if both fetches complete near-simultaneously before the abort signal propagates.

---

### Issue 2: Unhandled rejection when loser is aborted

**Problem:** After adding `AbortController`, the aborted fetch rejects with an `AbortError`. If nothing handles that rejection, Node.js emits an `unhandledRejection` event. In Node.js 15+ the process exits by default; in earlier versions the warning floods logs and can mask real errors.

**Fix:** A `.catch` handler is chained onto each fetch-and-parse chain. When the caught error's `name` is `"AbortError"`, the handler returns a `new Promise(() => {})` — a permanently-pending promise — so the rejection is swallowed silently. Any other error is re-thrown so real network or parse failures still propagate.

**Explanation:** When `primaryController.abort()` is called, `node-fetch` rejects the primary fetch promise with an `AbortError`. Because the original promise chain is not the one that won the race, nothing is `.catch`-ing it at the call site. The `.catch` intercept identifies intentional cancellations by checking `err.name === "AbortError"` and neutralises them by returning a never-resolving promise (so the outer `Promise` constructor's `resolve`/`reject` are never called from that path again). Real errors — timeouts, DNS failures, JSON parse failures — are re-thrown, so the outer `reject` still fires and the caller gets a proper rejection. A related pitfall: do not swallow all errors here, only `AbortError`; a broad `.catch(() => {})` would hide legitimate failures.
