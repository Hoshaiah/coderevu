## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Integer Zero Expires Session Cookie
// ------------------------------------------------------------------------

<?php
// auth/remember_me.php

define('REMEMBER_ME_SECONDS', 2592000); // 30 days

function issue_remember_me_cookie(string $token): void
{
    $expiry = time() + REMEMBER_ME_SECONDS;

    setcookie(
        'remember_token',
        $token,
        [
            // CHANGE 1: renamed 'expire' to 'expires' — PHP's setcookie() options array requires the key 'expires'; the misspelled key 'expire' is silently ignored, so PHP treats the cookie as session-scoped (no Max-Age/Expires header sent to the browser).
            'expires'  => $expiry,
            'path'     => '/',
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]
    );
}

// CHANGE 2: wrapped the token-generation and cookie-issuance in an explicit login-confirmed guard so the cookie is only issued when the user has actually authenticated and checked "remember me", not on every include.
if (!empty($_POST['remember_me']) && isset($_SESSION['just_authenticated'])) {
    $token = bin2hex(random_bytes(32));
    issue_remember_me_cookie($token);
    echo 'Cookie issued';
}
```

## Explanation

### Issue 1: Misspelled `expires` options key

**Problem:** Users check "remember me", but after closing and reopening the browser they are logged out. Inspecting the browser cookie jar shows the `remember_token` cookie has no expiry date — it is session-scoped and disappears when the browser closes.

**Fix:** Rename the key `'expire'` to `'expires'` in the options array passed to `setcookie()`. The reference solution changes exactly that one string token on the `'expire' => $expiry` line.

**Explanation:** PHP 7.3+ added support for passing cookie attributes as an associative array to `setcookie()`. The documented key name for the expiry timestamp is `'expires'` (with an `s`). PHP does not throw a warning or error for unrecognized keys; it silently drops `'expire'` and falls back to the default expiry of `0`. An expiry of `0` tells the browser the cookie is session-scoped, so no `Expires` or `Max-Age` header is emitted regardless of how large `REMEMBER_ME_SECONDS` is. The fix is a one-character addition — adding the `s` — after which PHP reads the key correctly and sends the expected `Expires` timestamp in the `Set-Cookie` header. A related pitfall: if you use the legacy positional-argument form of `setcookie($name, $value, $expire, ...)`, the parameter is the third positional integer and this typo cannot occur, but you also lose the ability to set `samesite` without a workaround.

---

### Issue 2: Unconditional cookie issuance at include time

**Problem:** The token-generation and `issue_remember_me_cookie()` call sit at the top level of the file with no condition. Any code that `require`s or `include`s `auth/remember_me.php` will immediately set a new `remember_token` cookie on the response, regardless of whether the user just logged in or checked the remember-me box.

**Fix:** Wrap the `bin2hex(random_bytes(32))` call and `issue_remember_me_cookie($token)` in a guard that checks `$_POST['remember_me']` and a session flag like `$_SESSION['just_authenticated']`, as shown in the `if` block added at the bottom of the reference solution.

**Explanation:** PHP executes top-level statements in an included file immediately at include time. Without a guard, every request that touches this file — even a background asset request or an unrelated page that happens to `require` it for the function definition — issues a fresh `remember_token` cookie. This overwrites any token the application already stored in the database for the user, silently invalidating their existing persistent session. The guard ties cookie issuance to evidence that a login form was submitted (`$_POST['remember_me']`) and that authentication succeeded (`$_SESSION['just_authenticated']`). In production you would also want to store the token's hash in the database and clear the `just_authenticated` flag after use to prevent replay.
