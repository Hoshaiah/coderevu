## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — setState After Unmount in Effect
// ------------------------------------------------------------------------

import React, { useState, useEffect } from "react";
import { fetchUserProfile, UserProfile } from "../api/users";

interface Props {
  userId: string;
}

export function UserProfileCard({ userId }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // CHANGE 1: Declare a cancelled flag so the .then() callback can check if the effect has been torn down before calling setState.
    let cancelled = false;

    setLoading(true);
    setProfile(null);

    fetchUserProfile(userId).then((data) => {
      // CHANGE 1: Guard both state updates behind the cancelled flag to prevent setState on an unmounted component.
      // CHANGE 2: The same guard also prevents a slow response for a previous userId from overwriting the current profile.
      if (!cancelled) {
        setProfile(data);
        setLoading(false);
      }
    });

    // CHANGE 1: Return a cleanup function that sets cancelled = true; React calls this when the component unmounts or userId changes.
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (!profile) return null;

  return (
    <div>
      <h2>{profile.name}</h2>
      <p>{profile.email}</p>
    </div>
  );
}
```

## Explanation

### Issue 1: setState Called After Unmount

**Problem:** When a user switches tabs quickly, React unmounts `UserProfileCard` before `fetchUserProfile` resolves. The `.then()` callback still runs and calls `setProfile` and `setLoading` on the now-dead component, producing the *"Can't perform a React state update on an unmounted component"* warning in the console.

**Fix:** A `cancelled` boolean is declared at the top of the effect. The `.then()` callback is wrapped in `if (!cancelled)` so neither `setProfile` nor `setLoading` fires after teardown. The effect returns a cleanup function that sets `cancelled = true`, which React calls on unmount or before re-running the effect.

**Explanation:** `useEffect` cleanup runs when the component unmounts *and* when any dependency in the deps array changes (here, `userId`). Without it, every in-flight promise still holds a reference to the `setProfile` and `setLoading` closures and will call them freely. The `cancelled` flag is the minimal way to break that link — the promise still resolves, but the callback becomes a no-op. Wrapping `try/catch` around `setProfile` (what the team tried) does nothing because `setProfile` itself does not throw; the warning is a React internal side-effect of calling a dispatcher for an unmounted fiber.

---

### Issue 2: Race Condition Causes Stale Profile Data

**Problem:** When `userId` changes rapidly (e.g., navigating between two profiles), two fetches are in flight simultaneously. If the request for user A takes longer than the request for user B, A's `.then()` fires last and overwrites the correct profile for user B, showing the wrong name and email in the UI.

**Fix:** The same `if (!cancelled)` guard at `CHANGE 2` covers this case. When `userId` changes, React re-runs the effect, which first executes the previous effect's cleanup (`cancelled = true`), invalidating the older in-flight promise before the new fetch starts.

**Explanation:** React's effect cleanup sequence on a dependency change is: run cleanup of the previous effect, then run the new effect body. So when `userId` flips from `"alice"` to `"bob"`, the cleanup sets Alice's `cancelled = true` before Bob's fetch even begins. If Alice's slow response then resolves, `!cancelled` is `false` and `setProfile` is skipped entirely, so Bob's data stays on screen. Without this guard the last-to-resolve fetch always wins regardless of which `userId` it belongs to.
