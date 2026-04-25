---
slug: localstorage-sensitive-token-storage
track: javascript
orderIndex: 71
title: Auth Token Stored in localStorage
difficulty: easy
tags:
  - security
  - hooks
  - react
language: typescript
---

## Context

This hook lives in `src/hooks/useAuth.ts` and is used throughout a healthcare SaaS application to persist the user's authentication token across browser sessions. The token is a signed JWT that grants access to patient records.

The security team flagged during a penetration test that any JavaScript running on the page — including injected scripts from XSS vulnerabilities in third-party analytics or rich-text editors — can read `localStorage` and exfiltrate the token. Because the token is long-lived (7-day expiry) and grants broad API access, successful exfiltration gives an attacker persistent access to patient data.

The team has already patched the known XSS vectors but recognizes that defense-in-depth requires not storing the token where scripts can reach it at all.

## Buggy code

```typescript
import { useState, useEffect } from 'react';

export function useAuth() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('auth_token')
  );

  function login(newToken: string) {
    localStorage.setItem('auth_token', newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem('auth_token');
    setToken(null);
  }

  return { token, login, logout };
}
```
