## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Event listener accumulates on every render, causing memory leaks and duplicate handlers
// ------------------------------------------------------------------------
import { useEffect, useState } from "react";

export function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    // CHANGE 1: Return a cleanup function so the listener is removed when the component unmounts (or before the effect re-runs). Without this, every mount adds a new listener and none are ever removed.
    return () => {
      window.removeEventListener("resize", handler);
    };
  }, []);

  return width;
}
```

## Explanation

### Issue 1: Listener never removed on unmount

**Problem:** Every time the component mounts, a new `resize` event listener is added to `window`. Because there is no cleanup, the old listeners from previous mounts are never removed. After navigating away and back several times, the handler fires once per accumulated mount, so a single resize event triggers `setWidth` multiple times and the count grows with each navigation cycle.

**Fix:** Return an arrow function from `useEffect` that calls `window.removeEventListener("resize", handler)`, using the same `handler` reference captured in the closure. This is the cleanup added at the `CHANGE 1` site.

**Explanation:** React calls the function returned from `useEffect` (the "cleanup") when the component unmounts, and also before re-running the effect if its dependencies change. Because the dependency array is `[]`, the effect runs once on mount and the cleanup runs once on unmount — that pairing keeps the listener count at exactly one while the component is alive. The key detail is that `handler` must be the same reference passed to both `addEventListener` and `removeEventListener`; creating a new arrow function inline in the remove call would not match and the listener would remain. A related pitfall: if you ever add dependencies to the array (e.g., a callback prop), the cleanup fires between each re-run, which is also correct behavior as long as the cleanup is present.

---

### Issue 2: Initial state may be stale before first resize

**Problem:** `useState(window.innerWidth)` reads the window width at the moment the hook's module is first evaluated or the component first renders. If the viewport was resized between page load and the component mounting — or if the component renders in a server-side or test environment — the stored width is stale until the next resize event occurs.

**Fix:** The `handler` function already reads `window.innerWidth` live inside the effect. Calling `handler()` once immediately after attaching the listener (or using a lazy initializer `useState(() => window.innerWidth)`) ensures the state reflects the current width at mount time. The reference solution uses `useState(window.innerWidth)` with the live read inside `handler`, which already corrects drift on any subsequent resize; the lazy initializer form is the safer pattern if SSR or deferred rendering is involved.

**Explanation:** `useState` only uses its argument as the initial value on the very first render of that component instance. If the width changes between the time the JavaScript bundle runs and the time the component actually mounts (which can be non-trivial in React 18 concurrent mode or with lazy loading), the stored value is wrong until a resize fires. Using a lazy initializer `() => window.innerWidth` defers the read to mount time rather than module-evaluation time, making it slightly more accurate. In practice the symptom is charts rendering at the wrong size on first load with no resize needed to fix them.
