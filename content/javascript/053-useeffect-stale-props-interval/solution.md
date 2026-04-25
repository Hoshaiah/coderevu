## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Stale Props Inside setInterval
// ------------------------------------------------------------------------

import { useEffect, useState } from 'react';

interface Props {
  symbol: string;
  intervalMs: number;
  onError: (err: Error) => void;
}

export function LivePriceTicker({ symbol, intervalMs, onError }: Props) {
  const [price, setPrice] = useState<number | null>(null);

  // CHANGE 1: Added symbol, intervalMs, and onError to the dependency array so the effect re-runs (clearing the old interval and starting a new one) whenever any of these values change, ensuring the closure always captures the current prop values.
  // CHANGE 2: Removed the eslint-disable comment that was suppressing the exhaustive-deps warning; onError is now listed so a stale handler reference cannot be captured silently.
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
  }, [symbol, intervalMs, onError]); // CHANGE 1 & CHANGE 2: correct deps replace the empty array and the suppression comment

  return <div>{price !== null ? `${symbol}: $${price}` : 'Loading…'}</div>;
}
```

## Explanation

### Issue 1: Stale Closure Over Props in Interval

**Problem:** After the user selects a different asset, the ticker keeps fetching the original symbol. The price displayed never updates to the new asset, or only does so if the page is refreshed. The interval fires correctly on schedule, but each call fetches the wrong URL.

**Fix:** Replace the empty dependency array `[]` with `[symbol, intervalMs, onError]` at the `useEffect` call site. The `eslint-disable` comment that was hiding this mistake is also removed.

**Explanation:** JavaScript closures capture variables by reference at the time the function is created. When `useEffect` runs with `[]`, the `tick` function is created once on mount and closes over the `symbol` value from that first render. Every subsequent `setInterval` call invokes the same `tick`, which still holds the original `symbol` string, so `fetch('/api/price/BTC')` keeps firing even after the user has switched to ETH. Adding `symbol` to the dependency array tells React to re-run the effect when `symbol` changes. The cleanup function `() => clearInterval(id)` runs first, tearing down the stale interval, then a fresh `tick` is created with the current `symbol` and a new interval starts. The same stale-closure problem applies to `intervalMs`: if the user changes their polling preference, the old interval cadence would persist without this fix.

---

### Issue 2: Stale `onError` Callback Reference

**Problem:** If the parent component re-renders and passes a new `onError` function reference (which is common when the handler is defined inline or with a hook), the interval's `tick` closure keeps calling the original handler. Errors may be reported to the wrong place, or the old handler may reference unmounted component state.

**Fix:** Add `onError` to the dependency array alongside `symbol` and `intervalMs`, and remove the `// eslint-disable-line react-hooks/exhaustive-deps` comment that was suppressing the warning about this omission.

**Explanation:** React's `react-hooks/exhaustive-deps` lint rule flags every value used inside an effect that is not listed as a dependency. The suppression comment was hiding two separate problems: `symbol`/`intervalMs` (Issue 1) and `onError`. If `onError` changes between renders — for example, the parent wraps it in a fresh arrow function on each render — the interval closure holds a reference to the old version. Listing `onError` ensures the effect re-runs when the callback identity changes, giving `tick` the current handler. If frequent re-creation of `onError` is a concern, the parent can stabilize it with `useCallback`, but that is the parent's responsibility; the child must still list it as a dependency to be correct.
