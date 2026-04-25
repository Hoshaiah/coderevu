---
slug: controlled-input-undefined-to-string
track: javascript
orderIndex: 93
title: Uncontrolled to Controlled Input Switch
difficulty: easy
tags:
  - react
  - state
  - types
  - hooks
language: typescript
---

## Context

This component is `src/components/ProfileForm.tsx`. It renders a form for editing a user profile. The form data is loaded asynchronously from an API, and the inputs are bound to state. Once the user edits a field and submits, the data is saved back to the server.

The browser console shows a React warning: *"A component is changing an uncontrolled input to be controlled."* This appears on every page load, immediately after the profile data arrives from the API. Additionally, any text the user types into the name field before the data loads is silently erased when the API response comes in.

The team noticed the warning only appears in development and thought it was harmless, but a QA engineer reported that on slow connections the form sometimes submits stale default values because React's internal tracking of the input was in an inconsistent state.

## Buggy code

```typescript
import React, { useState, useEffect } from "react";
import { fetchProfile, saveProfile, Profile } from "../api/profile";

export function ProfileForm({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | undefined>(undefined);

  useEffect(() => {
    fetchProfile(userId).then(setProfile);
  }, [userId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (profile) saveProfile(profile);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={profile?.name}
        onChange={(e) =>
          setProfile((prev) => prev && { ...prev, name: e.target.value })
        }
      />
      <input
        type="email"
        value={profile?.email}
        onChange={(e) =>
          setProfile((prev) => prev && { ...prev, email: e.target.value })
        }
      />
      <button type="submit">Save</button>
    </form>
  );
}
```
