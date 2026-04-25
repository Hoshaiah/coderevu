---
slug: set-interval-overlapping-async
track: javascript
orderIndex: 16
title: Overlapping Async setInterval Invocations
difficulty: hard
tags:
  - async
  - concurrency
  - javascript
language: javascript
---

## Context

This worker runs in `workers/priceFetcher.js`, a Node.js process that polls a pricing API every 10 seconds and writes the results to a Redis cache. The polling is implemented with `setInterval`. The pricing API is known to occasionally take 15–20 seconds to respond during off-peak hours.

During slow-API periods, operators observe duplicate write errors in Redis and, more dangerously, stale prices overwriting fresher ones. Specifically, a slow response from a previous tick (fetching "old" data) can arrive after a faster response from the current tick, clobbering the newer price. The logs show two concurrent `fetchAndStore` calls active at the same time.

The team tried wrapping the body in a `try/catch` to prevent crashes, which it does, but the race condition between overlapping ticks persists. They considered `setTimeout`-based recursion but are concerned about drift.

## Buggy code

```javascript
const POLL_INTERVAL_MS = 10_000;

async function fetchAndStorePrices() {
  const symbols = await db.getTrackedSymbols();
  const prices = await pricingApi.fetchBatch(symbols);
  for (const [symbol, price] of Object.entries(prices)) {
    await redis.set(`price:${symbol}`, price);
  }
  console.log(`[${new Date().toISOString()}] Updated ${Object.keys(prices).length} prices`);
}

setInterval(async () => {
  try {
    await fetchAndStorePrices();
  } catch (err) {
    console.error("Price fetch error:", err);
  }
}, POLL_INTERVAL_MS);
```
