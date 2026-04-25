## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Background job loses 'this' context inside a setTimeout callback and throws on every tick
// ------------------------------------------------------------------------
class MetricsCollector {
  constructor(apiClient) {
    this.client = apiClient;
    this.buffer = [];
    this.intervalHandle = null;
  }

  async fetchAndStore() {
    const data = await this.client.getMetrics();
    this.buffer.push(data);
    console.log(`Buffer size: ${this.buffer.length}`);
  }

  start() {
    // CHANGE 1: bind fetchAndStore to this instance so the method body receives the correct 'this' when setInterval invokes it as a plain function call.
    // CHANGE 2: store the returned handle so the interval can be cancelled later.
    this.intervalHandle = setInterval(this.fetchAndStore.bind(this), 30_000);
  }

  stop() {
    // CHANGE 2: expose a stop method that clears the stored handle.
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}

const collector = new MetricsCollector(apiClient);
collector.start();
```

## Explanation

### Issue 1: Lost `this` context in `setInterval` callback

**Problem:** Every 30 seconds the process logs `TypeError: Cannot read properties of undefined (reading 'push')` and the buffer stays empty. `fetchAndStore` is called but crashes before it can store anything.

**Fix:** Replace `this.fetchAndStore` with `this.fetchAndStore.bind(this)` at the `setInterval` call site. This produces a new function that permanently carries the correct `this` value regardless of how `setInterval` invokes it.

**Explanation:** When you write `setInterval(this.fetchAndStore, 30_000)`, JavaScript extracts the function object from the instance and passes it as a standalone callback. `setInterval` later calls that function with no receiver, so inside the callback `this` is `undefined` in strict mode (which classes always use). The first line that dereferences `this` — `this.buffer.push(data)` — immediately throws. `bind` creates a wrapper function that locks the `this` argument at the moment `start()` runs, so the callback always sees the right instance. An arrow-function alternative — `() => this.fetchAndStore()` — works for the same reason: arrow functions capture `this` lexically from the enclosing scope.

---

### Issue 2: Interval handle not stored, collector cannot be stopped

**Problem:** `setInterval` returns a handle that is the only way to cancel the polling loop. The original code discards it, so once `start()` is called the interval runs forever — even if the `MetricsCollector` instance is no longer needed or the process wants to shut down gracefully.

**Fix:** Assign the return value of `setInterval` to `this.intervalHandle` and add a `stop()` method that calls `clearInterval(this.intervalHandle)` and resets the field to `null`.

**Explanation:** `setInterval` schedules a recurring callback and hands back an opaque ID (a `Timeout` object in Node.js, a number in browsers). Without storing that ID there is no way to cancel the interval later. This matters during graceful shutdown, during tests that need to stop background work between runs, and in any scenario where the collector is replaced or restarted. Storing the handle in `this.intervalHandle` keeps it accessible to the instance. The `stop()` method guards with a `null` check so calling it multiple times is harmless.
