## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Stale Ref in Resize Observer
// ------------------------------------------------------------------------

import React, { useEffect, useRef } from 'react';

interface Props {
  onResize: (width: number, height: number) => void;
  children: React.ReactNode;
}

export function AutoResizePanel({ onResize, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // CHANGE 1: Store the latest onResize in a ref so the observer always calls the current version without needing to recreate itself.
  const onResizeRef = useRef<Props['onResize']>(onResize);

  // CHANGE 2: Keep the ref in sync with the prop on every render so it never goes stale.
  useEffect(() => {
    onResizeRef.current = onResize;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // CHANGE 1: Call through the ref instead of the captured prop value so we always invoke the latest callback.
        onResizeRef.current(width, height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  // CHANGE 2: Keep empty deps so the observer is created only once; the ref pattern removes the need to list onResize here.
  }, []);

  return <div ref={containerRef}>{children}</div>;
}
```

## Explanation

### Issue 1: Stale closure over `onResize` prop

**Problem:** The `ResizeObserver` callback captures `onResize` by value at the time the `useEffect` runs (once, on mount). Every subsequent resize event calls that original function, ignoring any new callback the parent passes in after a state change. The layout never reflects parent state updates triggered by those later callbacks.

**Fix:** A `useRef` named `onResizeRef` is added to hold the latest `onResize` value. Inside the observer callback, `onResizeRef.current(width, height)` is called instead of `onResize(width, height)` directly.

**Explanation:** JavaScript closures capture variables by reference but function values by the reference that existed when the closure was created. Because `useEffect` with `[]` deps runs once, `onResize` inside it always points to the first prop value. A ref, by contrast, is a stable object; only its `.current` property changes. By reading `.current` at call time (inside the ResizeObserver callback) rather than at capture time (inside `useEffect`), we always reach the most recently assigned callback. A related pitfall: if you try to fix this by adding `onResize` to the deps array instead, the observer is destroyed and recreated on every parent render that changes the callback reference — which can cause missed resize events during the reconnection window.

---

### Issue 2: `useEffect` deps array hides the staleness from the linter

**Problem:** The empty `[]` dependency array tells React (and the exhaustive-deps lint rule) that this effect has no external dependencies. That suppresses any warning about `onResize` being used inside the effect without being listed, so the stale-closure bug is invisible during development.

**Fix:** The empty deps array `[]` is kept intentionally, but a separate, dependency-free `useEffect` (no deps argument at all) is added above it. This second effect runs after every render and assigns `onResize` to `onResizeRef.current`, keeping the ref current without touching the observer lifecycle.

**Explanation:** A `useEffect` with no second argument runs after every render, making it the right place to synchronize a ref to the latest prop value. This is a deliberate pattern: the observer effect stays stable (created once, torn down on unmount) while the sync effect keeps the ref fresh. The two concerns are separated — observer lifecycle vs. callback currency. Without the sync effect, `onResizeRef.current` would also go stale because it is only set during initialization. The order matters: React guarantees the sync effect runs before the next paint, so `onResizeRef.current` is always up to date by the time any resize event fires in the same render cycle.
