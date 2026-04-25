---
slug: optional-chaining-short-circuit-side-effect
track: javascript
orderIndex: 86
title: Optional Chain Skips Required Side Effect
difficulty: hard
tags:
  - correctness
  - typescript
  - async
language: typescript
---

## Context

This code lives in `src/services/analytics.ts` in a Next.js application. The `trackEvent` function is responsible for sending analytics events to a third-party service. It is called from dozens of places throughout the app. The `analytics` object is loaded asynchronously and may be `null` before the library loads, so the team added optional chaining to guard against calling methods on `null`.

After deploying a refactor that moved event queuing into `trackEvent`, the team noticed that events fired before the analytics library loads are silently dropped instead of being queued. The on-call engineer found that the queue logic is being bypassed entirely when `analytics` is `null`. The bug only manifests during the first few seconds of page load, making it hard to reproduce in tests.

The team confirmed the queue is correctly flushed once the library loads. The regression was introduced when someone "simplified" a conditional into an optional chain.

## Buggy code

```typescript
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
  // Queue the event if analytics isn't loaded yet, then send it
  analytics?.track(event, props) ?? eventQueue.push({ event, props });
}
```
