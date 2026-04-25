---
slug: useeffect-stale-props-interval
track: javascript
orderIndex: 53
title: Stale Props Inside setInterval
difficulty: medium
tags:
  - hooks
  - closures
  - state
language: typescript
---

## Context

This React component lives in `src/components/LivePriceTicker.tsx`. It polls a price endpoint every `intervalMs` milliseconds and displays the latest price. The `symbol` prop changes when the user picks a different asset from a dropdown, and `intervalMs` is configurable per-user preference stored in context.

Users report that after switching the selected asset, the ticker continues to show prices for the old asset for a long time, and sometimes indefinitely. Metrics show the correct symbol is being fetched once on mount but then the old symbol is fetched on every tick.

Reducing `intervalMs` to a very small number did not change the bug. The team confirmed the parent re-renders with the new `symbol` prop correctly.

## Buggy code

```typescript
import { useEffect, useState } from 'react';

interface Props {
  symbol: string;
  intervalMs: number;
  onError: (err: Error) => void;
}

export function LivePriceTicker({ symbol, intervalMs, onError }: Props) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    async function tick() {
      try {
        const res = await fetch(`/api/price/${symbol}`);
        const { price } = await res.json();
        setPrice(price);
      } catch (err) {
        onError(err as Error);
      }
    }

    tick();
    const id = setInterval(tick, intervalMs);

    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div>{price !== null ? `${symbol}: $${price}` : 'Loading…'}</div>;
}
```
