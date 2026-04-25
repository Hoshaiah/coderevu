## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Unstable Context Causes All Consumers Rerender
// ------------------------------------------------------------------------

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface Permissions {
  canEdit: boolean;
  canDelete: boolean;
  canManageUsers: boolean;
}

interface PermissionsContextValue {
  permissions: Permissions | null;
  loading: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>(
  {} as PermissionsContextValue
);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // CHANGE 2: Create an AbortController so the fetch is cancelled when the effect cleans up (e.g. Strict Mode unmount/remount), preventing duplicate in-flight requests.
    const controller = new AbortController();

    fetch('/api/me/permissions', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setPermissions(data);
        setLoading(false);
      })
      // CHANGE 2: Ignore AbortError so a cancelled fetch doesn't log an unhandled error or update state on an unmounted provider.
      .catch((err) => { if (err.name !== 'AbortError') throw err; });

    // CHANGE 2: Return the cleanup function that aborts the fetch when the effect re-runs or the component unmounts.
    return () => controller.abort();
  }, []);

  // CHANGE 1: Memoize the context value object so its reference only changes when permissions or loading actually change, preventing unnecessary consumer re-renders.
  const value = useMemo<PermissionsContextValue>(
    () => ({ permissions, loading }),
    [permissions, loading]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
```

## Explanation

### Issue 1: Unstable Context Value Reference

**Problem:** Every time `PermissionsProvider` renders — triggered by any state update anywhere above it in the tree — the expression `{ permissions, loading }` produces a brand-new object with a new reference. React compares context values by reference, so it sees a "new" value every render and re-renders every consuming component, even though the actual data inside has not changed. `React.memo` on consumer components cannot help because the re-render is triggered by context, not props.

**Fix:** Wrap the value object in `useMemo` with `[permissions, loading]` as dependencies. The memoized object reference only changes when `permissions` or `loading` actually change.

**Explanation:** React's context propagation works like this: when the value passed to `<Context.Provider value={...}>` changes by reference, React walks the subtree and queues a re-render for every component that calls `useContext` with that context. When you write `value={{ permissions, loading }}` inline, a new object literal is allocated on every render of `PermissionsProvider`. Even if `permissions` and `loading` hold the same values as before, the new object has a different identity, so React treats it as a changed context value. `useMemo` caches the object and returns the same reference until one of its listed dependencies changes. A related pitfall: if you later add a callback (e.g. `refetch`) to the context value, wrap it in `useCallback` for the same reason before including it in the `useMemo` dependency array.

---

### Issue 2: Fetch Not Aborted on Cleanup, Causing Duplicate Requests

**Problem:** In React 18 Strict Mode (development), every `useEffect` runs twice — the component mounts, the effect runs, then React immediately unmounts and remounts the component to surface side-effect bugs. Because the original `useEffect` returns no cleanup function, the first fetch is never cancelled. Two concurrent requests to `/api/me/permissions` are sent on every development page load, and whichever one resolves last wins, potentially writing stale data into state.

**Fix:** Create an `AbortController` inside the effect, pass `controller.signal` to `fetch`, return `() => controller.abort()` as the cleanup function, and add a `.catch` that silently swallows `AbortError` so the cancellation does not surface as an unhandled error.

**Explanation:** `AbortController` gives you a signal object that you attach to a `fetch` call. When you call `controller.abort()`, the browser cancels the in-flight request and the promise rejects with a `DOMException` whose `name` is `'AbortError'`. Returning a cleanup function from `useEffect` tells React to call it before re-running the effect or before unmounting. So in Strict Mode: first mount starts fetch A and registers the cleanup; React unmounts and calls cleanup, aborting fetch A; React remounts and starts fetch B, which is the only request that completes. In production this also prevents a state update on an unmounted component if the user navigates away before the fetch resolves, which would otherwise log a React warning in older versions.
