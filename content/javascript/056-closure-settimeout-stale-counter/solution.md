## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — setTimeout Closure Captures Stale State
// ------------------------------------------------------------------------

import { useState, useEffect, useRef } from 'react';

interface Props {
  onSave: () => void;
}

export function AutoSave({ onSave }: Props) {
  const [count, setCount] = useState(5);
  const [active, setActive] = useState(false);

  // CHANGE 2: Store onSave in a ref so the interval callback always calls the latest version without needing it as a dependency.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!active) return;

    const id = setInterval(() => {
      // CHANGE 1: Use the functional updater form of setCount so the callback always receives the current state value instead of the stale closure value.
      setCount(prev => {
        if (prev <= 1) {
          clearInterval(id);
          setActive(false);
          onSaveRef.current();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  // CHANGE 2: Remove count and onSave from deps (onSave is accessed via ref; count is read via functional updater) so the interval is set up exactly once per activation.
  }, [active]);

  return (
    <div>
      {active ? (
        <span>Saving in {count}...</span>
      ) : (
        <button onClick={() => { setCount(5); setActive(true); }}>Start</button>
      )}
    </div>
  );
}
```

## Explanation

### Issue 1: Stale Closure Freezes Count

**Problem:** The countdown displayed on screen never moves — it stays at 5. Every second the interval fires, but the state update writes the same value (`5 - 1 = 4`) repeatedly because `count` inside the callback is always the value captured when the effect first ran.

**Fix:** Replace `setCount(count - 1)` with the functional updater `setCount(prev => prev - 1)`. The `if (prev <= 1)` branch that triggers the save and clears the interval is also moved inside this updater so it reads the same fresh `prev` value.

**Explanation:** JavaScript closures capture variables by reference to the binding, not by value, but React state is immutable per render. When the `setInterval` callback closes over `count`, it holds a reference to the `count` variable from the render in which the effect ran — which is `5`. Subsequent `setCount` calls create new state for new renders, but the old closure still points at the original binding that holds `5`. The functional updater form `setCount(prev => ...)` bypasses this entirely: React internally passes the latest committed state value as `prev` each time the updater runs, so the closure capturing stale `count` is irrelevant. A related pitfall: the same stale-closure issue appears in `useState` initializers passed to `setTimeout` or any async callback that outlives the render that created it.

---

### Issue 2: Missing Dependencies Perpetuate the Stale Closure

**Problem:** Even if a developer tried to fix the count decrement by reading `count` directly, adding `count` to the dependency array would cause a new `setInterval` to be created on every render where `count` changes, producing erratic behavior — multiple overlapping intervals that all race each other.

**Fix:** Keep `[active]` as the only dependency (so the interval is created once per activation), move `count` access into the functional updater from Issue 1, and access `onSave` through a `useRef` (`onSaveRef`) that is kept up to date in a separate single-dep effect. This means `onSave` no longer needs to be a dependency of the interval effect.

**Explanation:** React's `useEffect` dependency array controls when the effect re-runs and its cleanup re-fires. If `count` were added as a dependency, the effect would re-run every second: it would call `clearInterval` on the old id and then `setInterval` to create a new one, resetting the 1-second timer each tick and effectively stopping the countdown. Storing `onSave` in a ref is the standard pattern for "stable reference to a potentially-changing callback": the ref object itself never changes identity, so it is safe to omit from deps, while `onSaveRef.current` is always the latest prop value at call time. The alternative — adding `onSave` to the dependency array — would restart the interval every time the parent re-renders with a new inline function reference, which is a common source of accidental resets.
