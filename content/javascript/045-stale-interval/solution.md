## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Counter hook reads a stale value from setInterval
// ------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";

export function useTicker() {
  const [count, setCount] = useState(0);
  // CHANGE 2: track the latest count in a ref so the interval callback can read the current value
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    const id = setInterval(() => {
      // CHANGE 1: use the functional updater form so React passes the latest state value, avoiding the stale closure that always added 1 to the initial 0
      setCount(prev => {
        const next = prev + 1;
        // CHANGE 2: log via the updater's argument instead of the stale closed-over `count`
        console.log("[ticker]", next);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return count;
}
```

## Explanation

### Issue 1: Stale closure makes increment always set count to 1

**Problem:** The counter in the browser UI appears to stop at 1 and never go higher — or more precisely, it keeps setting the state to 1 on every tick. The log confirms this: it prints `[ticker] 0` every second regardless of how many seconds have passed.

**Fix:** Replace `setCount(count + 1)` with the functional updater form `setCount(prev => prev + 1)`. React passes the latest committed state value as `prev`, so the increment is always relative to the real current count, not the captured snapshot.

**Explanation:** When the `useEffect` runs with an empty dependency array `[]`, the callback passed to `setInterval` is created once and closes over the `count` variable at that moment — which is `0`. Every subsequent tick executes that same function, which still reads `count` as `0`, so it calls `setCount(0 + 1)` every time. React's functional updater form `prev => prev + 1` bypasses this entirely: React internally holds the authoritative state value and hands it to your callback fresh on each call. A related pitfall is adding `count` to the dependency array of the effect — that would fix the stale value but recreate the interval every second, which causes flicker and is wasteful.

---

### Issue 2: console.log prints stale captured count, not current value

**Problem:** Even if the UI incremented correctly, the `console.log("[ticker]", count)` line always prints `0` (the captured value at effect creation time) because it reads from the same stale closure as the `setCount` call.

**Fix:** Move the `console.log` inside the functional updater callback, logging the `next` local variable (derived from `prev + 1`) instead of the outer `count`. This runs with access to the real current value that React supplies.

**Explanation:** The `count` variable inside the interval callback is frozen at the value it had when the closure was formed — `0`. Moving the log inside the updater function means it reads `prev` (the authoritative current state supplied by React) and logs `prev + 1`, which is always the value that will actually be committed. An alternative approach is storing `count` in a `useRef` (`countRef.current = count` on every render) and reading `countRef.current` inside the interval; that also gives the latest value. The ref approach is useful when you need the current value outside a setter callback, but for just logging the next state, the updater form is more direct.
