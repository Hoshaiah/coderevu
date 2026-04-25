## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Stale Ref in DOM Event Listener
// ------------------------------------------------------------------------

import { useEffect, useRef } from "react";

interface Props {
  hotkey: string; // e.g. "ctrl+s"
  action: () => void;
  enabled: boolean;
}

export function KeyboardShortcut({ hotkey, action, enabled }: Props) {
  const actionRef = useRef(action);
  // CHANGE 1: Keep actionRef.current in sync with the latest action prop on every render so the listener never calls a stale function.
  actionRef.current = action;

  // CHANGE 2: Store enabled in a ref so the keydown handler always reads the current value without needing to re-register the listener.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const pressed =
        (e.ctrlKey ? "ctrl+" : "") +
        (e.metaKey ? "meta+" : "") +
        e.key.toLowerCase();

      // CHANGE 2: Read enabledRef.current instead of the captured enabled variable so the check always reflects the latest prop value.
      if (pressed === hotkey && enabledRef.current) {
        actionRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hotkey]);

  return null;
}
```

## Explanation

### Issue 1: Stale `action` ref never updated

**Problem:** After the user navigates to a new page, React passes a new `action` function as a prop, but `actionRef.current` still holds the function from the very first render. Every keypress calls the old action — for example, saving the previous form instead of the settings form.

**Fix:** Add `actionRef.current = action;` unconditionally at the top of the component body (outside any `useEffect`), so the ref is overwritten on every render with the latest prop value.

**Explanation:** `useRef` initializes once and does not update automatically when props change. The `useEffect` that registers the listener runs only when `hotkey` changes, so its closure captures `actionRef` (the object) but reads `.current` at call time — that part is correct. The mistake is that nothing ever writes a new value into `.current` after the first render. By assigning `actionRef.current = action` during render (not inside an effect), the ref is always up to date before any event fires. A related pitfall: do not put this assignment inside a `useEffect` with `[action]` as a dependency — that introduces a one-render lag where the ref is stale until after the paint.

---

### Issue 2: Stale `enabled` closure in event listener

**Problem:** `enabled` is read directly inside `handleKeyDown`, but that function is created once (when the effect runs) and closed over the `enabled` value at that moment. If `enabled` later changes from `false` to `true` (or vice versa), the listener keeps using the original value, so the shortcut stays permanently enabled or disabled regardless of prop updates.

**Fix:** Introduce `enabledRef` (a `useRef` mirroring `enabled`), assign `enabledRef.current = enabled` on every render alongside the action ref update, and replace the `enabled` read inside `handleKeyDown` with `enabledRef.current`.

**Explanation:** JavaScript closures capture variable bindings at creation time. Because the effect dependency array is `[hotkey]`, `handleKeyDown` is only recreated when `hotkey` changes. For any other render — such as `enabled` flipping — the existing closure runs with its original `enabled` snapshot. Reading from a ref instead of the closed-over variable sidesteps this because the ref object reference stays constant while `.current` is always mutated to the latest value during render. The same pattern applies to any prop or state that needs to be visible inside a long-lived event listener without re-registering it.
