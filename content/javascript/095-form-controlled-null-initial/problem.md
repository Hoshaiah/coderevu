---
slug: form-controlled-null-initial
track: javascript
orderIndex: 95
title: Null Initial State Uncontrolled Input
difficulty: easy
tags:
  - react
  - state
  - hooks
language: typescript
---

## Context

This component is `src/components/ProfileForm.tsx`. It loads a user's profile from an API on mount and pre-fills a form. The `username` field is a controlled `<input>` whose value is driven by a `useState` hook initialized from the API response.

The browser console consistently logs the warning: "A component is changing an uncontrolled input to be controlled." Users also notice that text they type before the API response arrives is silently discarded when the profile loads. This only happens on slower connections; on fast networks the data arrives before the user starts typing.

The developer already confirmed that the API response structure is correct and `profile.username` is always a non-null string when the response arrives. The TypeScript types even mark it as `string | null`.

## Buggy code

```typescript
interface UserProfile {
  id: string;
  username: string | null;
  bio: string;
}

const ProfileForm: React.FC = () => {
  const [username, setUsername] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((profile: UserProfile) => {
        setUsername(profile.username);
      });
  }, []);

  return (
    <form>
      <label htmlFor="username">Username</label>
      <input
        id="username"
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
    </form>
  );
};
```
