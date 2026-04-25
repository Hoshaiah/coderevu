---
slug: context-consumer-before-provider
track: javascript
orderIndex: 96
title: Context Consumed Outside Provider Tree
difficulty: easy
tags:
  - react
  - hooks
  - state
language: typescript
---

## Context

The file `src/context/AuthContext.tsx` defines an authentication context that stores the current user and a logout function. The context default value is intentionally left as `undefined` to force consumers to always be wrapped in the provider. A custom hook `useAuth` is exported for consumers.

After a recent refactor that moved the `<App />` component to a new entry point, engineers see a runtime crash: `TypeError: Cannot destructure property 'user' of undefined`. The crash happens on the initial render of certain route-level components. Components that worked before the refactor are suddenly broken.

The team confirmed `AuthProvider` is rendered correctly inside the new entry point and can see it in React DevTools. However, the crash occurs before the provider's children render.

## Buggy code

```typescript
import React, { createContext, useContext, useState } from "react";

interface AuthContextValue {
  user: { id: string; name: string } | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  const { user, logout } = context!; // Non-null assertion — "provider always wraps"
  return { user, logout };
}

// src/components/UserBadge.tsx — crashes at runtime:
// const { user } = useAuth();
// The component is rendered in a route that is somehow outside AuthProvider.
```
