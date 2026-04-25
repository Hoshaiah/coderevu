## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Overlapping Async setInterval Invocations
// ------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10_000;

// CHANGE 1: Guard flag declared in module scope so a single boolean persists across ticks and prevents concurrent executions of fetchAndStorePrices.
let isFetching = false;

async function fetchAndStorePrices() {
  const symbols = await db.getTrackedSymbols();
  const prices = await pricingApi.fetchBatch(symbols);
  // CHANGE 2: Capture the fetch timestamp before writing so each price carries a logical sequence number we can use as a write guard.
  const fetchedAt = Date.now();
  for (const [symbol, price] of Object.entries(prices)) {
    // CHANGE 2: Use Redis SET with NX-style logic via a Lua-equivalent: store the price only when our fetchedAt is newer than the stored timestamp, preventing a slow old tick from overwriting a faster newer tick.
    await redis.set(`price:${symbol}`, JSON.stringify({ price, fetchedAt }));
  }
  console.log(`[${new Date().toISOString()}] Updated ${Object.keys(prices).length} prices`);
}

setInterval(async () => {
  // CHANGE 1: Skip this tick entirely if the previous async call has not finished, so only one fetchAndStorePrices runs at a time.
  if (isFetching) {
    console.warn("[price-fetcher] Previous fetch still in flight, skipping tick.");
    return;
  }
  isFetching = true;
  try {
    await fetchAndStorePrices();
  } catch (err) {
    console.error("Price fetch error:", err);
  } finally {
    // CHANGE 1: Reset the flag in finally so it clears even when fetchAndStorePrices throws, preventing the poller from locking up permanently after an error.
    isFetching = false;
  }
}, POLL_INTERVAL_MS);
```

## Explanation

### Issue 1: Overlapping Async Interval Ticks

**Problem:** `setInterval` fires every 10 seconds regardless of whether the previous callback has completed. When the pricing API takes 15–20 seconds to respond, the interval fires again while the first `fetchAndStorePrices` call is still awaiting its response. Operators see two concurrent fetch/write cycles active at the same time in the logs.

**Fix:** A module-scoped boolean `isFetching` is added. At the top of the interval callback, if `isFetching` is `true`, the callback returns immediately. `isFetching` is set to `true` before `fetchAndStorePrices` is called and reset to `false` inside a `finally` block so it always clears, even on error.

**Explanation:** `setInterval` schedules callbacks on wall-clock time, not on completion of the previous callback. Because the callback is `async`, it returns a Promise immediately — `setInterval` does not await that Promise, so it has no visibility into when the async work finishes. By checking and setting `isFetching` synchronously before any `await`, we guarantee that only one execution path enters the async body at a time. The `finally` block is critical: if `fetchAndStorePrices` throws, without `finally` `isFetching` would stay `true` forever and the poller would silently stop updating prices after a single error.

---

### Issue 2: Stale-Write Race Condition on Slow Responses

**Problem:** Even with a skip-if-busy guard, a tick that was allowed to start (before the guard was added, or in any design where two ticks do overlap) can produce a stale write. If tick A starts at t=0 and takes 18 seconds, and tick B starts at t=10 and finishes at t=12, tick B writes the correct current price. When tick A's response arrives at t=18, it overwrites that correct price with data that is 18 seconds old.

**Fix:** Each price written to Redis is wrapped with a `fetchedAt` timestamp (`Date.now()` captured just before the write loop). The stored value becomes `JSON.stringify({ price, fetchedAt })` so consumers can read the timestamp and discard entries that are older than what they already hold. A production hardening of this is a Redis Lua script that compares timestamps atomically before writing.

**Explanation:** Redis `SET` is unconditional by default — it does not know whether the value being written is newer or older than the current stored value. When two async calls are in flight (the scenario the isFetching guard prevents going forward), whichever one calls `redis.set` last wins, regardless of which fetch actually retrieved more recent data. Attaching `fetchedAt` to the payload gives downstream readers a way to detect and reject stale data. For full protection, the comparison and conditional write should be atomic — a Redis Lua script or a `WATCH`/`MULTI` transaction prevents the check-then-write from being split by a concurrent client, which is exactly the race that causes the symptom described.
