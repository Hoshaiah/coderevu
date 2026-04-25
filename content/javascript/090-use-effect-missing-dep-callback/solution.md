## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — useEffect omits a prop callback from deps, silently calling a stale version of the function
// ------------------------------------------------------------------------
import { useEffect, useRef } from "react";

interface Props {
  endpoint: string;
  onData: (data: unknown) => void;
}

export function PollingWidget({ endpoint, onData }: Props) {
  // CHANGE 2: Store onData in a ref so the interval always calls the latest version without needing to restart the interval when only the callback changes.
  const onDataRef = useRef(onData);
  // CHANGE 2: Keep the ref current on every render so it never goes stale.
  onDataRef.current = onData;

  useEffect(() => {
    const id = setInterval(() => {
      fetch(endpoint)
        .then((r) => r.json())
        // CHANGE 1: Call onDataRef.current instead of the captured onData, so the latest callback is always invoked regardless of when the interval fires.
        .then((data) => onDataRef.current(data));
    }, 5000);
    return () => clearInterval(id);
    // CHANGE 1: Dependency array intentionally contains only `endpoint`. onData is handled via the ref above, which avoids restarting the interval on every callback identity change while still calling the latest handler.
  }, [endpoint]);

  return <div>Polling {endpoint}…</div>;
}
```

## Explanation

### Issue 1: Stale `onData` closure in interval callback

**Problem:** After a parent component swaps the `onData` prop (e.g., switching data sources), the `PollingWidget` keeps calling the original handler. Users see new data routed to the wrong destination — the old handler — until the `endpoint` prop also changes and forces the effect to re-run.

**Fix:** Replace direct use of `onData` inside the interval callback with `onDataRef.current(data)`. The `onDataRef` is a `useRef` whose `.current` is updated to the latest `onData` on every render, so the interval always reads the freshest version.

**Explanation:** `useEffect` closes over the values that exist at the time the effect runs. Because `onData` is not in the dependency array, React never re-runs the effect when `onData` changes, so the closed-over reference stays frozen at the first render's value. A `useRef` sidesteps this: updating `onDataRef.current = onData` on every render is synchronous and outside any effect, so by the time the next interval tick fires, `.current` already points to the new handler. This pattern deliberately avoids adding `onData` to the dependency array, which would otherwise tear down and restart the interval on every render where the parent creates a new function reference (e.g., an inline arrow function), causing unnecessary fetch cycles.

---

### Issue 2: No mechanism to reflect `onData` changes without restarting the interval

**Problem:** Even if `onData` were added to the dependency array, parent components that define `onData` as an inline function would cause the interval to be destroyed and recreated on every render, resetting the 5-second timer constantly. The ref approach is needed to decouple callback freshness from interval lifecycle.

**Fix:** Introduce `const onDataRef = useRef(onData)` and assign `onDataRef.current = onData` on each render (both labeled `CHANGE 2`). This keeps a mutable, always-current reference to the callback that the interval closure can read without the effect depending on `onData` directly.

**Explanation:** React's `useRef` returns a stable object whose `.current` property can be mutated freely. Writing `onDataRef.current = onData` during render — not inside an effect — guarantees the ref is updated before any event handler or timer callback that runs later in the same render cycle's aftermath. The interval closure captures `onDataRef` (the stable object), not `onDataRef.current` (the value), so each tick dereferences `.current` at call time rather than at closure-creation time. A related pitfall: do not set `onDataRef.current` inside a `useEffect`, because effects run asynchronously after paint and could leave a brief window where the ref still holds the old value when a timer fires.
