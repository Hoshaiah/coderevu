## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Session Cookie Missing Secure Flags
// ------------------------------------------------------------------------

<?php
// public/index.php

define('APP_ROOT', dirname(__DIR__));
require APP_ROOT . '/vendor/autoload.php';

// CHANGE 1: Set session.cookie_secure=true so the browser only sends the cookie over HTTPS, preventing accidental transmission over HTTP.
// CHANGE 2: Set session.cookie_httponly=true so JavaScript cannot read the cookie, blocking session theft via XSS.
ini_set('session.cookie_secure', '1');
ini_set('session.cookie_httponly', '1');

session_start();

$router = new App\Router();
$router->dispatch($_SERVER['REQUEST_URI'], $_SERVER['REQUEST_METHOD']);
```

## Explanation

### Issue 1: Session Cookie Transmitted Over HTTP

**Problem:** PHP does not set the `Secure` flag on session cookies by default. If a user visits the HTTP version of the site — even once, even by accident — their browser sends the session cookie in that unencrypted request. An attacker on the same network can capture it and hijack the session.

**Fix:** Add `ini_set('session.cookie_secure', '1')` before `session_start()`. This tells PHP to include `Secure` in the `Set-Cookie` header, so the browser refuses to send the cookie on non-HTTPS requests.

**Explanation:** The `Secure` cookie attribute is a browser-side enforcement mechanism. When it is absent, the browser applies no protocol restriction and happily sends the cookie over `http://`. The reverse proxy not enforcing HTTPS for all paths means real HTTP requests can reach the app, or an attacker can trick the user into making one. Setting `session.cookie_secure` before `session_start()` ensures the flag appears in the `Set-Cookie` header emitted when the session is created. A related pitfall: if you set this flag after the session cookie has already been issued to existing users, those users retain an insecure cookie until it expires or they log out — so deploying this change should be paired with invalidating old sessions.

---

### Issue 2: Session Cookie Accessible to JavaScript

**Problem:** PHP's `session.cookie_httponly` defaults to `0` in many configurations. A page with any XSS vulnerability can call `document.cookie` and read the session cookie, then exfiltrate it to an attacker-controlled server.

**Fix:** Add `ini_set('session.cookie_httponly', '1')` before `session_start()`. This causes PHP to emit the `HttpOnly` attribute in the `Set-Cookie` header, which tells the browser to hide the cookie from all JavaScript APIs.

**Explanation:** `HttpOnly` does not prevent XSS itself, but it removes the session cookie as a target. Without it, even a low-severity reflected XSS (e.g., an unsanitized query parameter echoed in an error message) is enough to steal authenticated sessions. With the flag set, `document.cookie` simply does not include the session cookie — the browser omits it from that API while still sending it on HTTP requests automatically. The flag must be in place when the cookie is first issued, so `ini_set` must run before `session_start()`. Note that `HttpOnly` does not protect against CSRF or network-layer eavesdropping; both flags together are the minimum baseline for a session cookie on an app handling sensitive data.
