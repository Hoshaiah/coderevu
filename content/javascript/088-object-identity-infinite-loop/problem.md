---
slug: object-identity-infinite-loop
track: javascript
orderIndex: 88
title: Object Literal Props Trigger Infinite Render Loop
difficulty: easy
tags:
  - effects
  - referential-equality
  - object-identity
  - deps
language: typescript
---

## Context

A `UserProfile` component fetches user details whenever its `options` prop changes. In local testing everything looks fine, but as soon as this component is mounted in the parent, the browser tab freezes and DevTools shows an endless stream of network requests.

## Buggy code

```typescript
import { useEffect, useState } from "react";

interface Options {
  includeAvatar: boolean;
}

function UserProfile({ userId, options }: { userId: string; options: Options }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}?avatar=${options.includeAvatar}`)
      .then((r) => r.json())
      .then(setUser);
  }, [userId, options]);

  return <div>{user ? JSON.stringify(user) : "Loading..."}</div>;
}

// Parent component
export function App() {
  return <UserProfile userId="42" options={{ includeAvatar: true }} />;
}
```
