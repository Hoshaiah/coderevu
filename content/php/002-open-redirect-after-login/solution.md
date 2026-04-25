## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Post-login redirect uses an unvalidated `next` query parameter, enabling phishing redirects
// ------------------------------------------------------------------------
<?php
// auth/login_post.php

session_start();

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', getenv('DB_PASSWORD'));

$email    = $_POST['email']    ?? '';
$password = $_POST['password'] ?? '';
// CHANGE 2: Read `next` from POST body instead of GET so it travels with the form submission and cannot be injected independently via a crafted URL.
$next     = $_POST['next']     ?? '/dashboard';

// CHANGE 1: Validate that $next is a relative path only — no scheme, no host. parse_url extracts the scheme and host; if either is present the value is an absolute URL pointing somewhere off-site and we fall back to /dashboard.
$parsed = parse_url($next);
if (
    !empty($parsed['scheme']) ||
    !empty($parsed['host'])   ||
    strpos($next, '//') === 0  // protocol-relative URL like //evil.example.com
) {
    $next = '/dashboard';
}
// CHANGE 1 (continued): Also ensure the path starts with '/' so it is
// unambiguously relative to this origin and not a sneaky bare hostname.
if (substr($next, 0, 1) !== '/') {
    $next = '/dashboard';
}

$stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    header('Location: /login?error=1');
    exit;
}

session_regenerate_id(true);
$_SESSION['user_id'] = $user['id'];

header('Location: ' . $next);
exit;
```

## Explanation

### Issue 1: Unvalidated `next` enables open redirect

**Problem:** After a successful login the application calls `header('Location: ' . $next)` where `$next` comes directly from user-supplied input with no checks. An attacker sends a victim to `/login?next=https://evil.example.com`. After the victim logs in normally, the browser follows the redirect to the attacker's site. The victim sees a legitimate login page, then lands on a convincing phishing page.

**Fix:** After reading `$next`, call `parse_url($next)` and reject the value if `scheme` or `host` is non-empty, or if the string starts with `//` (protocol-relative form). Also reject any value whose first character is not `/`. On rejection, fall back to `/dashboard`. These checks appear at the `CHANGE 1` sites.

**Explanation:** `header('Location: …')` will happily emit any string the application hands it, and browsers treat an absolute URL in a `Location` header as a cross-origin redirect. `parse_url` decomposes the URL so you can inspect individual components rather than trying to write a regex. The `//evil.example.com` edge case matters because browsers interpret a leading `//` as a scheme-relative URL — `parse_url` returns no `scheme` for it, so you need the explicit `strpos` check. Requiring a leading `/` as a final gate ensures only paths on the same origin are accepted even if a future change accidentally skips the parse step.

---

### Issue 2: `next` read from `$_GET` instead of `$_POST`

**Problem:** The login form is submitted via POST, but the code reads `next` from `$_GET`. This means an attacker can append `?next=…` to the form's action URL at any time — it is completely independent of the form fields. Even if the HTML form includes a hidden `next` field, the GET parameter overrides it because the code never reads `$_POST['next']`.

**Fix:** Change `$_GET['next']` to `$_POST['next']` at the `CHANGE 2` site. The HTML login form should render `next` as a hidden `<input>` so its value is submitted in the POST body alongside the credentials.

**Explanation:** Query-string parameters on a POST action URL are visible to and modifiable by anyone, requiring no form interaction at all. Reading the value from `$_POST` instead ties `next` to the form submission itself. Combined with the origin validation in Issue 1, this means the only way to influence `next` is to submit the login form with a crafted hidden field — and even then the value is rejected if it is not a local path. A CSRF token on the login form would further prevent an attacker from pre-populating hidden fields via a forged form submission.

---

### Issue 3: No CSRF protection on the login form

**Problem:** The login endpoint accepts POST requests from any origin. An attacker can host a page with a form that auto-submits to `/login` with the attacker's own credentials, logging the victim into the attacker's account (login CSRF). The victim then unknowingly uses the site while authenticated as the attacker, exposing the victim's activity (entered addresses, saved payment methods, etc.) to the attacker.

**Fix:** This fix requires changes in both the form template and the handler. In the handler, verify that `$_POST['csrf_token']` matches a token stored in `$_SESSION['csrf_token']` before processing credentials. Generate the token during the GET request that renders the login form and embed it as a hidden field. The `CHANGE 3` comment marks where the check belongs — immediately after `session_start()` and before any credential processing.

**Explanation:** Browsers send cookies (including the session cookie) with cross-origin form POSTs unless `SameSite=Strict` is set on the cookie. A CSRF token stored in the session and echoed into the form is unreadable to a third-party page, so a forged POST cannot supply the correct token. `SameSite=Lax` on the session cookie partially mitigates this for top-level navigations but does not cover all attack surfaces. An explicit token check is the reliable defence.
