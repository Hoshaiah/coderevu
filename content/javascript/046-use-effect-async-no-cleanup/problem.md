---
slug: use-effect-async-no-cleanup
track: javascript
orderIndex: 46
title: Async Effect Sets State After Unmount
difficulty: easy
tags:
  - hooks
  - async
  - react
language: typescript
---

## Context

This component lives in `src/components/UserProfile.tsx` and fetches a user's profile data from an API endpoint when a `userId` prop changes. It is rendered inside a tabbed layout, so users frequently switch between tabs, causing the component to mount and unmount rapidly.

In development the browser console fills with React warnings: `Warning: Can't perform a React state update on an unmounted component`. In production the app sometimes shows stale profile data from a previous user briefly before settling on the correct one, or it shows an error state that immediately clears — symptoms that confuse QA.

The developer already tried wrapping the fetch in a `try/catch` to handle network errors and confirmed that helps with the error logging, but the stale-state warnings still appear.

## Buggy code

```typescript
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
    setLoading(true);
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data: Profile) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [userId]);

  if (loading) return <p>Loading...</p>;
  if (!profile) return <p>No profile found.</p>;
  return <p>{profile.name} — {profile.email}</p>;
}
```
