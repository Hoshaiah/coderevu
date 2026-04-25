## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Selector Returning New Object Every Render
// ------------------------------------------------------------------------

import { useStore } from '../store';
import { PriceChart } from './PriceChart';
import { useShallow } from 'zustand/react/shallow';

export function StatsPanel() {
  // CHANGE 1 & 2: wrap the selector with useShallow so Zustand compares each extracted value individually instead of comparing the new object reference returned by the selector on every call.
  const { tickCount, lastPrice } = useStore(
    useShallow((state) => ({
      tickCount: state.tickCount,
      lastPrice: state.lastPrice,
    }))
  );

  return (
    <div className="stats-panel">
      <p>Ticks received: {tickCount}</p>
      <PriceChart currentPrice={lastPrice} />
    </div>
  );
}
```

## Explanation

### Issue 1: Selector Constructs New Object Every Invocation

**Problem:** Every time the Zustand store notifies any subscriber, `useStore` calls the selector. The selector `(state) => ({ tickCount: state.tickCount, lastPrice: state.lastPrice })` builds a brand-new plain object on every call. Even if `tickCount` and `lastPrice` hold the same values as before, the returned object occupies a new memory address, so it is never `===` to the previous result.

**Fix:** Wrap the selector in `useShallow` (imported from `zustand/react/shallow`). `useShallow` returns a stable wrapper that performs a shallow key-by-key comparison instead of a reference check, so the component only re-renders when at least one extracted value actually changes.

**Explanation:** JavaScript's `{}` literal always allocates a new object; two objects with identical contents are not `===` to each other. Zustand's default subscription check is `previousResult !== nextResult`. Because the selector returns a new object every tick, that check always evaluates to `true`, scheduling a re-render on every store update — roughly every 200 ms in this case, hundreds of times per second in the profiler. `useShallow` replaces the comparison with a loop over the object's keys, checking `prev[key] !== next[key]` for each one. If all values match, it returns the previous object reference unchanged, so Zustand sees `===` and skips the re-render. A related pitfall: `React.memo` on the component cannot help here because the problem is the hook triggering a state change inside the component itself, not a parent passing new props.

---

### Issue 2: Missing Equality Function Allows Reference Comparison to Always Fail

**Problem:** `useStore` accepts an optional equality function as its second argument. Without it, Zustand uses `Object.is` (strict reference equality). Because the selector always returns a new object (Issue 1), this equality check always returns `false`, and every store update triggers a re-render regardless of whether the displayed data changed.

**Fix:** `useShallow` from `zustand/react/shallow` acts as a combined selector-wrapping utility that internally supplies shallow equality logic, removing the need to pass a separate second argument while still fixing the equality comparison at the same `useStore` call site.

**Explanation:** Zustand exposes a second argument to `useStore` — a custom equality function — precisely for cases where the selector returns a derived or composed value. Passing `shallow` directly as that second argument (the older pattern) or wrapping with `useShallow` (the current recommended pattern for Zustand v4+) both achieve the same result: swap out reference equality for shallow equality. The shallow check iterates over the top-level keys of the returned object and compares each with `Object.is`. This means the subscription fires only when `tickCount` or `lastPrice` actually carries a new value, which matches the intended behavior described in the problem context.
