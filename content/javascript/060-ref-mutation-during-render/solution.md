## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Ref Mutated During Render Phase
// ------------------------------------------------------------------------

import React, { useRef, useEffect, useState } from "react";

interface Props {
  target: number;
}

export function AnimatedCounter({ target }: Props) {
  const [display, setDisplay] = useState(0);
  const rafId = useRef<number | null>(null);
  const startValue = useRef(0);

  const renderCount = useRef(0);
  // CHANGE 1: Move ref mutation into useEffect so it only runs after a committed render, not during the render phase itself; this respects Strict Mode's double-invoke of the render function without inflating the count.
  useEffect(() => {
    renderCount.current += 1;
    console.log("Render count:", renderCount.current);
  });

  useEffect(() => {
    // CHANGE 2: Capture startValue from display at effect run time (after commit) rather than relying on a stale ref written during a potentially-discarded render; this ensures the animation always starts from the last committed displayed value.
    startValue.current = display;
    const start = performance.now();
    const duration = 500;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.round(startValue.current + (target - startValue.current) * progress);
      setDisplay(current);

      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    }

    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  // CHANGE 2: Add display to the dependency array so the effect re-captures the current displayed value as the animation start point whenever display changes; without this, startValue.current is set once from a stale render-time value.
  }, [target, display]);

  return <div className="counter">{display}</div>;
}
```

## Explanation

### Issue 1: Ref mutated during render phase

**Problem:** `renderCount.current += 1` runs directly in the component function body, which is the render phase. In React 18 Strict Mode, the render function is intentionally invoked twice (with the second result discarded) to surface side effects. Every time the component renders, the count increments twice, so telemetry logs jump by 2 and the count diverges from actual committed renders.

**Fix:** The mutation `renderCount.current += 1` and its `console.log` are moved inside a `useEffect` with no dependency array. This effect runs only after a committed render, once per mount and once per update, not during the discarded double-invoke.

**Explanation:** React's rules treat the render function as a pure computation. Mutating a ref there is technically allowed in one narrow case — reading/writing a ref that is only used during renders — but incrementing a telemetry counter violates the expectation that calling the function twice has no observable side effect. Strict Mode exploits this by running the render function twice and throwing away one result; the ref mutation from the discarded run is not rolled back, so the counter is off by one per render. Moving the increment into `useEffect` ties it to the commit phase, which Strict Mode does not double-invoke (though it does mount/unmount/remount effects in development, so the count still reflects committed renders accurately).

---

### Issue 2: Stale `startValue` causes animation to restart from zero

**Problem:** The animation `useEffect` depends only on `[target]`, but it assigns `startValue.current = display` inside the effect. When `target` changes while an animation is already in progress, `display` may hold a mid-animation value at the time of the render that triggered the effect, but because `display` is not in the dependency array the effect might use a stale captured value — or, worse, it runs once at mount and never updates `startValue` as `display` advances, causing the next target change to animate from 0 instead of from the current visible number.

**Fix:** `display` is added to the dependency array of the animation `useEffect`, so every time `display` is committed to state the effect re-runs, updates `startValue.current` to the latest displayed value, and restarts the animation from there toward `target`.

**Explanation:** `startValue.current = display` captures whatever `display` was at the time the effect last ran. If only `target` is listed as a dependency, the effect runs when `target` changes but `display` at that moment is whatever the last committed state was — which is 0 on first mount. Mid-animation the ref is never refreshed, so a second `target` change still interpolates from the original start of 0. Adding `display` to deps means the effect fires on every state tick, which sounds expensive but is correct: each tick sets `startValue.current` to the just-committed value, then immediately launches a new RAF that will advance toward `target`. A related pitfall is that this creates a tighter animation loop; if performance is a concern, a single `useRef` tracking the in-progress animation value (instead of state) could reduce re-renders, but correctness comes first.
