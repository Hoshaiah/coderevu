## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Uncontrolled to Controlled Input Switch
// ------------------------------------------------------------------------

import React, { useState, useEffect } from "react";
import { fetchProfile, saveProfile, Profile } from "../api/profile";

export function ProfileForm({ userId }: { userId: string }) {
  // CHANGE 1: Initialize with empty strings so inputs are always controlled from the first render.
  const [profile, setProfile] = useState<Profile>({ name: "", email: "" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // CHANGE 2: Merge API data into existing state so any edits the user made before load are not blown away; only update if the form is still in its pristine (unedited) state by using the loaded flag to guard a cautious merge.
    fetchProfile(userId).then((serverProfile) => {
      setProfile((prev) =>
        loaded ? prev : { ...serverProfile }
      );
      setLoaded(true);
    });
  }, [userId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveProfile(profile);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        // CHANGE 1: value is now always a string (never undefined), keeping the input controlled throughout its lifetime.
        value={profile.name}
        onChange={(e) =>
          setProfile((prev) => ({ ...prev, name: e.target.value }))
        }
      />
      <input
        type="email"
        // CHANGE 1: same fix for the email input — always a string.
        value={profile.email}
        onChange={(e) =>
          setProfile((prev) => ({ ...prev, email: e.target.value }))
        }
      />
      <button type="submit">Save</button>
    </form>
  );
}
```

## Explanation

### Issue 1: Undefined `value` causes uncontrolled input

**Problem:** On first render `profile` is `undefined`, so `profile?.name` and `profile?.email` both evaluate to `undefined`. React sees `value={undefined}` and registers the inputs as uncontrolled. When the API responds and state becomes a real object, React tries to switch them to controlled, logs the warning, and its internal tracking of the inputs is in a mixed state — which can cause the submit handler to see stale DOM values rather than React-tracked ones.

**Fix:** The `useState` initializer changes from `undefined` to `{ name: "", email: "" }` (CHANGE 1), and the `value` props change from `profile?.name` / `profile?.email` to `profile.name` / `profile.email` so the inputs always receive a string.

**Explanation:** React decides whether an input is controlled at mount time based on whether `value` is `undefined` or not. `undefined` means "uncontrolled — the DOM owns this value". Any other value, including an empty string, means "controlled — React owns this value". Once React marks an input as uncontrolled it does not cleanly hand control back; it keeps reading the raw DOM node, so whatever `onChange` writes to state may never make it into the submitted value on slow connections. Starting with `{ name: "", email: "" }` keeps both inputs controlled from the first paint, eliminating the warning and the inconsistent tracking.

---

### Issue 2: API response silently overwrites user edits

**Problem:** If a user types into the name field before the `fetchProfile` promise resolves, `setProfile(serverProfile)` replaces the entire state object. The user's in-progress text disappears without any indication, and the form now contains whatever the server returned.

**Fix:** CHANGE 2 replaces the bare `.then(setProfile)` with a callback that checks the `loaded` flag. If `loaded` is `false` (the form is still in its initial, unedited state), the server data is applied. If `loaded` is already `true` — meaning a previous fetch for this `userId` already ran — the current `prev` state is kept, preserving any edits.

**Explanation:** The `loaded` flag acts as a one-shot gate: the first time the API responds for a given `userId`, it populates the form; after that, further responses (e.g., from a re-render) do not overwrite user edits. This matters on slow connections where the round-trip can take several seconds and users reasonably start typing early. A related pitfall: if `userId` changes, the `useEffect` cleanup should ideally cancel the in-flight request; without cancellation an old response could still arrive and set `loaded`, but that is a separate concern handled by an AbortController and is outside the scope of this fix.
