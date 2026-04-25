## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Event Listener Leak on Unmount
// ------------------------------------------------------------------------

import React, { useEffect, useRef } from "react";

interface Props {
  onSave: () => void;
  onClose: () => void;
}

export function KeyboardShortcutHandler({ onSave, onClose }: Props) {
  // CHANGE 1: Store the latest callbacks in refs so the event handler always calls the current version without being listed as a dependency that changes every render.
  const onSaveRef = useRef(onSave);
  const onCloseRef = useRef(onClose);

  // CHANGE 2: Keep refs up-to-date on every render so stale closures are never an issue, without changing the refs' identities.
  useEffect(() => {
    onSaveRef.current = onSave;
    onCloseRef.current = onClose;
  });

  // CHANGE 1 (continued): Empty dependency array means this effect runs once on mount and cleans up once on unmount — exactly one listener is ever registered.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onSaveRef.current();
      }
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    // cleanup
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []); // CHANGE 1: Was [onSave, onClose] — those change every render, re-registering a new listener each time without the old cleanup ever firing correctly during the same mount lifetime.

  return null;
}
```

## Explanation

### Issue 1: Dependency Array Causes Listener Accumulation

**Problem:** After each render where `onSave` or `onClose` has a new identity, React re-runs the `useEffect`. It calls the cleanup (removing the old listener) and then immediately adds a fresh one. However, when the parent passes inline arrow functions like `onSave={() => save()}`, a new function object is created on every parent render, so React sees a changed dependency and re-runs the effect. Over multiple modal open/close cycles — each of which triggers parent re-renders — the number of registered listeners grows, and every keypress fires the handler once per registered listener.

**Fix:** Replace `[onSave, onClose]` in the dependency array with `[]` so the effect runs once on mount and cleans up once on unmount. Store `onSave` and `onClose` in `useRef` objects (`onSaveRef`, `onCloseRef`) updated on every render via a separate no-dependency `useEffect`, and call `onSaveRef.current()` / `onCloseRef.current()` inside the stable `handleKeyDown` closure.

**Explanation:** React's `useEffect` cleanup is called before the next effect run, not at unmount time alone. So when `onSave`'s reference changes, the old listener is removed and a new one is added — but only if the component is still mounted. The problem is that each modal session can trigger many parent re-renders, multiplying listeners during a single mount. By fixing the dependency array to `[]`, `handleKeyDown` is registered exactly once per mount. Using refs for the callbacks avoids the stale-closure issue that would otherwise arise: without the ref pattern, an empty-dependency effect captures the `onSave` and `onClose` values from the first render and never sees updates. The ref is mutated synchronously on every render, so the handler always sees the latest version without adding those callbacks as effect dependencies.

---

### Issue 2: Inline Callbacks in Parent Make Instability Near-Certain

**Problem:** Even if a developer knows that `useEffect` re-runs when dependencies change, they might assume the parent is stable. In practice, parent components almost always pass freshly created arrow functions or `.bind` calls, so `onSave` and `onClose` have a new object identity on every render. This turns the theoretical dependency-array problem into a guaranteed one — the listener count doubles with every parent re-render, not just with every modal cycle.

**Fix:** The same ref-based approach from CHANGE 1 and CHANGE 2 addresses this: `onSaveRef` and `onCloseRef` are updated in a side-effect that runs after every render with no dependency guard, so any new function reference the parent provides is captured immediately without influencing the registration effect's dependency array.

**Explanation:** JavaScript function equality is referential: `() => save() === () => save()` is `false`. React uses `Object.is` for dependency comparison, so it sees two different arrow functions as two different values even if they do the same thing. The ref update pattern (`useEffect(() => { ref.current = value; })`) is a deliberate pattern for exactly this situation: it keeps the stable effect's closure pointing at a mutable cell, and the cell is refreshed after every render. One related pitfall is calling `ref.current()` during render rather than inside the event handler — that would read a stale value. Calling it inside the async event handler is safe because by the time a keypress fires, all pending renders have already updated the ref.
