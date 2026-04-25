## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Logout Leaves Session Data Live
// ------------------------------------------------------------------------

<?php
// auth/logout.php

session_start();

// Clear all session variables
session_unset();

// CHANGE 1: Destroy the server-side session file so a replayed PHPSESSID cookie cannot reload session data from disk.
session_destroy();

// CHANGE 2: Use time() - 3600 (a clear, conventional past timestamp) instead of the opaque magic number 42000.
setcookie(
    session_name(),
    '',
    time() - 3600,
    '/'
);

// CHANGE 3: Send cache-control headers so browsers do not serve stale authenticated pages from their cache after logout.
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

header('Location: /login.php');
exit;
```

## Explanation

### Issue 1: Session File Not Destroyed on Logout

**Problem:** After the user clicks logout, the session file on disk still exists. A penetration tester who captured the `PHPSESSID` cookie value before logout can paste it into a new request. PHP's session handler finds the file, loads it, and the application sees an authenticated session.

**Fix:** Add `session_destroy()` immediately after `session_unset()`. `session_destroy()` deletes the session file from the server's filesystem (the `CHANGE 1` line), so there is nothing left to reload even if the old cookie is replayed.

**Explanation:** `session_unset()` only clears the `$_SESSION` array in memory for the current request. It does not touch the on-disk file. When a new request arrives carrying the same `PHPSESSID`, `session_start()` reads the file and populates `$_SESSION` from it. If the file still exists but is now empty (because `session_unset()` ran and PHP serialized an empty array), the application's check `isset($_SESSION['user_id'])` returns false — which looks safe — but any other application that writes extra data into the session, or if the logout happened to unset only specific keys, the replayed session could carry live data. Calling `session_destroy()` removes the file entirely, so the session ID is invalidated at the server regardless of what the client sends.

---

### Issue 2: Magic Number in Cookie Expiry

**Problem:** The cookie expiry offset `42000` is an arbitrary number with no obvious meaning. It equals 11.67 hours, which is unusual and leaves future maintainers wondering whether it was intentional or a typo.

**Fix:** Replace `time() - 42000` with `time() - 3600` (the `CHANGE 2` line). 3600 seconds (one hour) is a conventional past-timestamp that clearly communicates "expired one hour ago" and is well understood by PHP developers.

**Explanation:** Any negative offset from `time()` causes the browser to treat the cookie as expired and delete it, so the functional result is the same. The problem is that `42000` is not a named constant and does not appear in any PHP documentation, making it a maintenance hazard. A reviewer cannot tell at a glance whether the value was chosen deliberately or is a bug. Using `time() - 3600` or even `1` (the Unix epoch) communicates intent unambiguously. If the application later moves to `session_set_cookie_params()`, the magic number would need to be tracked down and updated in multiple places.

---

### Issue 3: Browser Cache Serves Authenticated Pages After Logout

**Problem:** After logout, if the user presses the browser back button, the browser may render a previously cached authenticated page — the shopping cart, account details, inbox — without sending a new request to the server at all. The user sees live-looking authenticated content even though their session is gone.

**Fix:** Add `header('Cache-Control: no-store, no-cache, must-revalidate')` and `header('Pragma: no-cache')` before the redirect (the `CHANGE 3` lines). These headers instruct both the browser and any intermediate proxy not to store a copy of this response.

**Explanation:** HTTP caching is independent of PHP sessions. Even after `session_destroy()` runs, the browser's local cache may hold a copy of a previously fetched authenticated page. When the user navigates back, the browser serves that copy directly from disk without contacting the server. The `no-store` directive is the strongest cache-control instruction; it tells the browser never to write the response to any cache. `must-revalidate` ensures that even if a proxy did cache something, it must check with the origin before serving it. The `Pragma: no-cache` header is a fallback for HTTP/1.0 clients. These headers should also be set on every authenticated page, not just the logout endpoint, to prevent the same issue from a mid-session capture.
