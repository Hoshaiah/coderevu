---
slug: react-context-missing-stable-ref
track: javascript
orderIndex: 54
title: Unstable Context Causes All Consumers Rerender
difficulty: medium
tags:
  - hooks
  - react
  - state
language: typescript
---

## Context

This context lives in `src/contexts/PermissionsContext.tsx`. It fetches the current user's permissions from `/api/me/permissions` on mount and makes them available to deeply nested components across the app. The permissions rarely change — only on role upgrades.

A performance audit reveals that every component consuming `usePermissions()` re-renders on every keystroke in any input field anywhere in the app, even though permissions have not changed. React DevTools Profiler shows the re-renders originating from `PermissionsProvider`. The audit also flags that the component renders twice on mount in development (React 18 Strict Mode), which floods the network with duplicate `/api/me/permissions` requests.

The team already verified that the consumer components are wrapped in `React.memo` — but they still re-render. They suspect the context value itself is the problem.

## Buggy code

```typescript
import { createContext, useContext, useEffect, useState } from 'react';

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
    fetch('/api/me/permissions')
      .then((r) => r.json())
      .then((data) => {
        setPermissions(data);
        setLoading(false);
      });
  }, []);

  return (
    <PermissionsContext.Provider value={{ permissions, loading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
```
