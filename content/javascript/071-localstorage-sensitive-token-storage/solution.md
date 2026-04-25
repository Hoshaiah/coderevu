## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Auth Token Stored in localStorage
// ------------------------------------------------------------------------

import { useState, useEffect } from 'react';

// CHANGE 1: Token is no longer stored in localStorage. HttpOnly cookies are set/cleared server-side so no client JS can read them. The client only tracks a boolean or opaque flag, never the raw token.
export function useAuth() {
  // CHANGE 2: State no longer seeds itself from localStorage; the token is opaque to JS when stored in an HttpOnly cookie, so we track only whether a session exists via a non-sensitive indicator.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // A non-sensitive flag (e.g. a plain "logged_in" cookie readable by JS, or a sessionStorage marker) tells the UI whether to show authenticated routes without exposing the JWT itself.
    return document.cookie.includes('session_active=true');
  });

  // CHANGE 1: login() calls a server endpoint that sets the JWT as an HttpOnly, Secure, SameSite=Strict cookie — the token never touches client-side storage.
  async function login(credentials: { username: string; password: string }) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include', // ensures the browser stores the HttpOnly cookie the server sets
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!response.ok) throw new Error('Login failed');
    // CHANGE 2: We set only a JS-readable presence flag, never the token itself.
    setIsAuthenticated(true);
  }

  // CHANGE 3: logout() calls the server to invalidate the session and clear the HttpOnly cookie, rather than calling localStorage.removeItem which would be a no-op now.
  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    setIsAuthenticated(false);
  }

  return { isAuthenticated, login, logout };
}
```

## Explanation

### Issue 1: JWT stored where scripts can read it

**Problem:** The original hook calls `localStorage.setItem('auth_token', newToken)` so the raw JWT sits in a storage area that any JavaScript execution context on the page can reach via `localStorage.getItem('auth_token')`. If a third-party script, browser extension, or injected payload runs on the page, it can silently read and exfiltrate the 7-day token, giving an attacker persistent access to patient records without the user ever knowing.

**Fix:** The `login()` function is replaced with an `async` function that POSTs credentials to `/api/auth/login` with `credentials: 'include'`. The server responds by setting the JWT in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The token string never appears in JavaScript at all — only the browser's cookie jar holds it, and the `HttpOnly` flag prevents any JS from reading it.

**Explanation:** Browsers enforce a hard boundary: cookies flagged `HttpOnly` are sent automatically with matching requests but are invisible to `document.cookie` reads and to `localStorage`/`sessionStorage`. This means even if an attacker achieves arbitrary JS execution on the page, `document.cookie` will not contain the token. The server validates the cookie on every API request via the standard cookie header, so nothing about the authentication flow changes from the server's perspective. One pitfall: `SameSite=Strict` must also be set, otherwise a CSRF attack could abuse the cookie; `Lax` is an acceptable middle ground for most flows.

---

### Issue 2: State seeded from untrusted client storage

**Problem:** The original `useState` initializer calls `localStorage.getItem('auth_token')` synchronously. If an attacker has written a forged or replayed token string into `localStorage` (possible after any past XSS or via a browser extension), the hook bootstraps an authenticated session from that tampered value without any server-side check at initialization time.

**Fix:** The `useState` initializer is replaced with a read of a non-sensitive JS-readable flag (`document.cookie.includes('session_active=true')`). This flag communicates only "a session cookie exists" — not the token itself. The hook no longer exposes a `token: string` value; it exposes `isAuthenticated: boolean`, so callers cannot accidentally leak the token into props or logs.

**Explanation:** When the JWT lives in an `HttpOnly` cookie the client-side code has no legitimate reason to ever hold the token string in a JS variable. Seeding React state from `localStorage` on mount means the token travels through React's reconciler, DevTools, and any component that destructures `{ token }`. Replacing it with a boolean eliminates that entire surface. The authoritative source of truth about session validity is the server: if the `HttpOnly` cookie is missing or expired, the next API call will return `401` and the app can react accordingly.

---

### Issue 3: logout() targets the wrong storage mechanism

**Problem:** The original `logout()` calls `localStorage.removeItem('auth_token')`, which correctly undoes the original `setItem` call. But after the fix moves token storage to an `HttpOnly` cookie, calling `localStorage.removeItem` on logout becomes a no-op — the cookie remains valid and the user is still technically authenticated on the server.

**Fix:** `logout()` is replaced with an `async` function that POSTs to `/api/auth/logout` with `credentials: 'include'`. The server clears the `HttpOnly` cookie by issuing a `Set-Cookie` header with `Max-Age=0`. Client state is then set to `false` via `setIsAuthenticated(false)`.

**Explanation:** HttpOnly cookies can only be removed by the server issuing a replacement `Set-Cookie` with an expired date or zero max-age — client JS cannot write `document.cookie` for them either. If logout only clears React state, the browser still holds a valid cookie and any subsequent request the browser makes (or that the user triggers after a page reload) will include the cookie and succeed. Calling the logout endpoint makes the server the authoritative party in terminating the session, which also allows server-side token revocation (e.g., adding the JTI to a denylist) as a further layer of defense.
