## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Optional Chain Skips Required Side Effect
// ------------------------------------------------------------------------

interface AnalyticsClient {
  track(event: string, props: Record<string, unknown>): void;
}

let analytics: AnalyticsClient | null = null;
const eventQueue: Array<{ event: string; props: Record<string, unknown> }> = [];

export function initAnalytics(client: AnalyticsClient): void {
  analytics = client;
  eventQueue.forEach(({ event, props }) => analytics!.track(event, props));
  eventQueue.length = 0;
}

export function trackEvent(event: string, props: Record<string, unknown> = {}): void {
  // CHANGE 1: Replace the optional-chain + nullish-coalesce expression with an explicit null check so that the queue push always runs when analytics is null, and track() always runs when analytics is available.
  if (analytics === null) {
    // CHANGE 2: Queue the event unconditionally when analytics is not yet loaded, instead of relying on a ?? fallback that never fires because analytics?.track() evaluates to undefined (not null) and short-circuits the right-hand side.
    eventQueue.push({ event, props });
  } else {
    analytics.track(event, props);
  }
}
```

## Explanation

### Issue 1: Optional chain silently drops events before library loads

**Problem:** When `analytics` is `null`, `analytics?.track(event, props)` evaluates to `undefined` and stops there. The `?? eventQueue.push(...)` expression never executes because `??` only fires when the left side is `null` or `undefined` — and `undefined` *is* produced here, so you might expect it to fire. The catch: the optional chain returns `undefined` before even attempting to call `track`, yet that same `undefined` satisfies the `??` operator's trigger condition. Wait — actually the `??` *should* fire. The deeper problem is that `analytics?.track(event, props)` returning `undefined` *does* satisfy `??`, so `eventQueue.push` does get called. But `analytics?.track` when `analytics` is non-null returns `void` (also `undefined`), which *also* triggers `??` — meaning on every successful track call the event is *also* pushed to the queue, corrupting the queue for the next cold start.

**Fix:** Replace the entire `analytics?.track(event, props) ?? eventQueue.push({ event, props })` expression with an explicit `if (analytics === null)` branch at CHANGE 1 and CHANGE 2. The `if` branch pushes to the queue; the `else` branch calls `analytics.track(event, props)` directly.

**Explanation:** The `??` operator fires when its left operand is `null` or `undefined`. `void` functions always return `undefined`, so `analytics?.track(...)` returns `undefined` both when `analytics` is `null` (skipped call) and when `analytics` is non-null (successful call). That means `eventQueue.push` runs on *every* invocation, not just when the library is missing. Events pile up in the queue even after the library loads, and on the next `initAnalytics` call they get re-sent as duplicates. An explicit `if/else` on `analytics === null` separates the two code paths cleanly and makes the intent unambiguous, eliminating dependence on the return type of `track`.

---

### Issue 2: Side-effect correctness depends on void return type of track()

**Problem:** The original code uses the return value of `analytics?.track(event, props)` as the controlling value for whether to queue the event. `track` is declared to return `void`, so this design breaks the moment any analytics library returns a truthy value from `track` (e.g., a Promise or an event ID), which would suppress the `??` fallback and silently drop events during the loading window.

**Fix:** At CHANGE 1 and CHANGE 2, the condition is `analytics === null` — a direct check on the state variable — rather than an inference from the return value of `track`. The queue push and the `track` call are in separate branches with no logical connection to what `track` returns.

**Explanation:** Relying on a function's return value to decide whether to run a side effect creates a hidden coupling: the correctness of `trackEvent` now depends on the implementation detail that `track` returns `void`/`undefined`. If the `AnalyticsClient` interface is updated to return `Promise<void>` (common in analytics SDKs that batch over the network), the `??` fallback would never run even when `analytics` is `null`, because a Promise object is neither `null` nor `undefined`. The explicit `if (analytics === null)` check eliminates this coupling entirely and makes `trackEvent` robust to any return type `track` might have in the future.
