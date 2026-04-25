## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Async Effect Sets State After Unmount
// ------------------------------------------------------------------------

import { useEffect, useState } from 'react';

interface Profile {
  name: string;
  email: string;
  avatarUrl: string;
}

interface Props {
  userId: string;
}

export function UserProfile({ userId }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // CHANGE 2: Reset profile to null immediately when userId changes so stale data is never shown while the new fetch is in flight.
    setProfile(null);
    setLoading(true);

    // CHANGE 1: Introduce an AbortController so we can cancel the fetch and skip setState calls when the component unmounts or userId changes.
    const controller = new AbortController();

    fetch(`/api/users/${userId}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: Profile) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        // CHANGE 1: Ignore abort errors — they are expected when the effect cleans up; only log genuine network/server failures.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error(err);
        setLoading(false);
      });

    // CHANGE 1: Return a cleanup function that aborts the in-flight fetch when the component unmounts or before the next effect run.
    return () => {
      controller.abort();
    };
  }, [userId]);

  if (loading) return <p>Loading...</p>;
  if (!profile) return <p>No profile found.</p>;
  return <p>{profile.name} — {profile.email}</p>;
}
```

## Explanation

### Issue 1: setState called after unmount

**Problem:** When the user switches tabs, React unmounts `UserProfile`, but any in-flight `fetch` keeps running. When the promise resolves, the `.then` callbacks call `setProfile` and `setLoading` on the now-unmounted component. React prints `Warning: Can't perform a React state update on an unmounted component` in development. In production the update is silently swallowed, but if the component remounts quickly for a different `userId`, the stale callback can race with the new fetch and briefly set wrong data.

**Fix:** An `AbortController` is created inside the effect. Its `signal` is passed to `fetch`. The effect's cleanup function (the returned arrow function) calls `controller.abort()`. The `.catch` handler checks for `AbortError` and returns early instead of calling `setLoading(false)`.

**Explanation:** `useEffect` cleanup runs both when the component unmounts and before the effect re-runs due to a dependency change. By aborting the fetch at that moment, the browser cancels the HTTP request if it hasn't completed yet, and — more importantly for already-completed requests — the aborted signal causes the promise chain to reject with a `DOMException` named `'AbortError'`. Filtering that error out in `.catch` means `setState` is never called for a superseded or unmounted request. One pitfall: if you forget the `AbortError` guard, every tab switch logs a spurious error to the console, which can drown out real failures.

---

### Issue 2: Stale profile visible during userId transition

**Problem:** When `userId` changes, the effect re-runs but `profile` still holds the previous user's data. Until the new fetch completes, the component skips the loading branch (because `loading` briefly remains `false` between renders) and renders the old profile name and email. QA sees a flash of the wrong user's information.

**Fix:** `setProfile(null)` is added at the top of the effect body, immediately before `setLoading(true)`. This happens synchronously on the same render cycle as the dependency change, so `profile` is `null` by the time the component re-renders after the state update.

**Explanation:** React batches state updates inside event handlers, but inside `useEffect` each `setState` call triggers a re-render independently in React 17 and below. Even in React 18 with automatic batching, placing `setProfile(null)` and `setLoading(true)` together at the top of the effect ensures the component moves into the `loading` state before any stale profile can be painted. Without this reset, the sequence is: dependency changes → old profile is still in state → component renders old data → fetch completes → component renders new data. The `null` reset closes that window. A related pitfall is forgetting to reset error state in components that also track fetch errors — the same pattern applies there.
