## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Theme context value is recreated every render, causing all consumers to re-render unnecessarily
// ------------------------------------------------------------------------
import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";

interface Theme {
  primary: string;
  toggle: () => void;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  // CHANGE 2: Wrap toggle in useCallback so its reference is stable across renders. Without this, toggle is a new function every render, which makes the memoized value below see a changed dependency and still produce a new object.
  const toggle = useCallback(() => setIsDark((d) => !d), []);

  // CHANGE 1: Wrap the context value in useMemo so the same object reference is returned on every render where isDark and toggle haven't changed. React compares context value by reference; a new object every render forces every consumer to re-render regardless of whether the data changed.
  const value = useMemo(
    () => ({
      primary: isDark ? "#000" : "#fff",
      toggle,
    }),
    [isDark, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
```

## Explanation

### Issue 1: Context value object recreated every render

**Problem:** Every time `ThemeProvider` re-renders — triggered by anything in the component tree above it, including the unrelated search input updating its parent's state — a brand-new `{ primary, toggle }` object literal is created and passed to `ThemeContext.Provider`. React compares context values by reference (`Object.is`), so every consumer that calls `useTheme()` sees a "changed" value and schedules its own re-render, even though `isDark` hasn't moved.

**Fix:** The inline object literal passed to `value` is replaced with a `useMemo`-wrapped variable named `value`. `useMemo` returns the cached object as long as `isDark` and `toggle` have not changed, giving `ThemeContext.Provider` a stable reference to pass down.

**Explanation:** React's context propagation works by storing the current value on the provider fiber and notifying all subscribed consumers when the stored value changes. "Changed" means `Object.is(prev, next)` returns `false`. An inline object literal like `{ primary, toggle }` always allocates a new heap object, so `Object.is` always returns `false`, unconditionally notifying every consumer. `useMemo` breaks this cycle: it runs the factory function only when a listed dependency actually changes, handing back the same object reference otherwise. A related pitfall: if the dependencies array is omitted or wrong, `useMemo` either never recomputes (stale data) or always recomputes (no benefit), so the dependencies must mirror exactly what the factory uses.

---

### Issue 2: toggle function recreated every render

**Problem:** Even after memoizing the context value object, the `toggle` arrow function is still declared inline in the render body, which means it is a new function reference on every render. Because `useMemo`'s dependency array includes `toggle`, a new `toggle` reference causes `useMemo` to recompute and produce a new context value object, defeating the fix for Issue 1 entirely.

**Fix:** `toggle` is wrapped with `useCallback(() => setIsDark((d) => !d), [])`. `useCallback` returns the same function reference across renders when its dependency array is stable (here it is empty because the updater form of `setIsDark` closes over nothing from the component scope).

**Explanation:** `useMemo` and `useCallback` rely on referential stability of their dependencies to decide whether to recompute. `toggle` is a dependency of the `useMemo` that builds the context value. Without `useCallback`, every render produces a new `toggle` function, which changes the dependency, which causes `useMemo` to run, which produces a new object, which triggers all consumers — the same bug as Issue 1 but one level of indirection deeper. The empty dependency array `[]` is safe here because the updater callback `(d) => !d` only uses its argument, not any props or state from the enclosing scope, so it never needs to be replaced.
