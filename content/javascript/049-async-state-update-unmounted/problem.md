---
slug: async-state-update-unmounted
track: javascript
orderIndex: 49
title: setState After Unmount in Effect
difficulty: medium
tags:
  - hooks
  - async
  - react
  - state
language: typescript
---

## Context

This component lives in `src/features/UserProfile.tsx`. It fetches a user's profile data from an API when it mounts, shows a loading spinner, then renders the profile. It is rendered inside a tab panel; switching tabs unmounts the component.

The application logs a React warning in the console: *"Warning: Can't perform a React state update on an unmounted component."* This warning appears when users switch tabs quickly before the profile fetch completes. In some cases the UI also briefly shows stale data from a previous user when navigating between profiles.

The team confirmed the API calls themselves are succeeding (network tab shows 200 responses). They tried wrapping `setProfile` in a `try/catch` but the warning persisted.

## Buggy code

```typescript
import React, { useState, useEffect } from "react";
import { fetchUserProfile, UserProfile } from "../api/users";

interface Props {
  userId: string;
}

export function UserProfileCard({ userId }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setProfile(null);

    fetchUserProfile(userId).then((data) => {
      setProfile(data);
      setLoading(false);
    });
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
