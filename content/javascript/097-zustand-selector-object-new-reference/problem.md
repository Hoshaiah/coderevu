---
slug: zustand-selector-object-new-reference
track: javascript
orderIndex: 97
title: Selector Returning New Object Every Render
difficulty: medium
tags:
  - react
  - state
  - performance
  - hooks
language: typescript
---

## Context

This component lives in `src/features/dashboard/StatsPanel.tsx`. It reads two slices of state from a Zustand store and renders a chart. The store is updated by a WebSocket subscription that publishes new tick data roughly every 200 ms.

Operators monitoring the dashboard report extremely high CPU usage in the browser tab. React DevTools' Profiler shows `StatsPanel` re-rendering hundreds of times per second even when the specific values it reads (`tickCount` and `lastPrice`) have not changed between ticks.

Switching to `React.memo` on the component did not help. The team ruled out the WebSocket handler as the source — the store updates are correct and only write new values when they genuinely change.

## Buggy code

```typescript
import { useStore } from '../store';
import { PriceChart } from './PriceChart';

export function StatsPanel() {
  const { tickCount, lastPrice } = useStore((state) => ({
    tickCount: state.tickCount,
    lastPrice: state.lastPrice,
  }));

  return (
    <div className="stats-panel">
      <p>Ticks received: {tickCount}</p>
      <PriceChart currentPrice={lastPrice} />
    </div>
  );
}
```
