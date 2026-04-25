## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Context Consumed Outside Provider Tree
// ------------------------------------------------------------------------

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
  // CHANGE 1: Remove the non-null assertion and instead explicitly check for undefined, so that components rendered outside AuthProvider get a clear error instead of a destructuring crash.
  // CHANGE 2: Throw a descriptive error when context is undefined, making the misconfiguration immediately obvious at the call site rather than producing a cryptic TypeError.
  if (context === undefined) {
    throw new Error(
      "useAuth must be used within an AuthProvider. " +
      "Ensure the component is rendered inside <AuthProvider>."
    );
  }
  const { user, logout } = context;
  return { user, logout };
}

// src/components/UserBadge.tsx — now gets a clear error instead of crashing:
// const { user } = useAuth();
// If rendered outside AuthProvider, throws: "useAuth must be used within an AuthProvider."
```

## Explanation

### Issue 1: Non-null Assertion Hides Undefined Context

**Problem:** When a component using `useAuth` renders outside `AuthProvider`, `useContext(AuthContext)` returns `undefined` because that is the context's default value. The `!` operator on line `const { user, logout } = context!` tells TypeScript to trust that the value is never `undefined`, so the compiler stays silent. At runtime, JavaScript still tries to destructure `undefined`, producing `TypeError: Cannot destructure property 'user' of undefined`.

**Fix:** Remove the `!` non-null assertion after `context`. Add an explicit `if (context === undefined)` guard before destructuring, as shown at the CHANGE 1 and CHANGE 2 sites.

**Explanation:** TypeScript's non-null assertion (`!`) is a compile-time-only hint. It tells the type checker to treat a value as non-null, but generates no runtime check whatsoever. So when the actual runtime value is `undefined`, the subsequent destructuring throws immediately. The root cause is that after the refactor some routes mount before `AuthProvider` is in scope — perhaps a lazy-loaded route that resolves before the provider tree is ready, or a component imported outside the provider's subtree. Removing the assertion and adding an `if` guard means the check actually executes at runtime. The explicit throw in the guard (Issue 2) makes the failure mode obvious, so developers can trace the problem to the missing provider wrap rather than chasing a generic destructuring error.

---

### Issue 2: Missing Actionable Error for Out-of-Provider Usage

**Problem:** Even after fixing the non-null assertion, if `useAuth` just returns `undefined` or silently returns empty values, developers still see confusing downstream errors — a missing `user` value causes null-reference chains deep in the render tree, far from the actual misconfiguration.

**Fix:** At the CHANGE 2 site, throw a descriptive `Error` with a message that names both the hook (`useAuth`) and the required wrapper (`AuthProvider`) when `context === undefined`. This replaces the silent no-op with an immediate, targeted failure.

**Explanation:** React context propagates a default value to any consumer that has no matching provider above it in the tree. Setting that default to `undefined` is a deliberate pattern to detect missing providers, but it only pays off if the hook actually checks for `undefined` and reacts. Without the explicit throw, the component receives `undefined` and the error surfaces at whichever line first tries to read a property — which may be several components deep and hard to connect back to the missing `AuthProvider`. Throwing at the `useAuth` call site means the stack trace points directly to the hook, and the error message tells the developer exactly what to fix. A related pitfall: if you give the context a non-`undefined` default (like `{ user: null, logout: () => {} }`), this guard becomes impossible to trigger, so components silently use stale or no-op values — another reason to keep the default as `undefined` and guard explicitly.
