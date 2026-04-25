## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unvalidated Host Header Redirect
// ------------------------------------------------------------------------

<?php
// sso/callback.php

session_start();

require_once __DIR__ . '/../lib/saml.php';

$assertion = saml_parse_response($_POST['SAMLResponse']);

if (!$assertion || !$assertion->isValid()) {
    http_response_code(400);
    exit('Invalid SAML response');
}

$_SESSION['user_id']    = $assertion->getNameId();
$_SESSION['user_email'] = $assertion->getAttribute('email');
session_regenerate_id(true);

$returnTo = $_SESSION['return_to'] ?? '/';

// CHANGE 1: Reject protocol-relative URLs (e.g. //evil.com) which start with / but are treated as external by browsers; require exactly one leading slash that is NOT followed by another slash or a backslash.
// CHANGE 2: Also strip any CR or LF characters to block HTTP header injection before the redirect is emitted.
if (!preg_match('#^/(?![/\\\\])#', $returnTo) || preg_match('/[\r\n]/', $returnTo)) {
    $returnTo = '/';
}

// CHANGE 3: Parse the stored value as a URL and reject it if a host component is present, ensuring the redirect is always same-origin even if future code paths populate return_to differently.
$parts = parse_url($returnTo);
if (!empty($parts['host'])) {
    $returnTo = '/';
}

unset($_SESSION['return_to']);

header('Location: ' . $returnTo);
exit;
```

## Explanation

### Issue 1: Protocol-relative URL bypass

**Problem:** The original check (`str_starts_with($returnTo, '/')`) passes for values like `//evil.com/steal` because that string does start with `/`. When the browser receives `Location: //evil.com/steal` it interprets it as an absolute URL using the current scheme, sending the just-authenticated user directly to the attacker's site.

**Fix:** Replace the `str_starts_with` check with a `preg_match` that requires a single leading `/` *not* followed by another `/` or a `\` (`#^/(?![/\\\\])#`). Any value that fails this pattern is reset to `'/'`.

**Explanation:** RFC 3986 defines `//` at the start of a path component as the beginning of an authority (host) section. Every major browser honours this when constructing the full URL, so `//evil.com` is functionally identical to `https://evil.com`. The original developer's mental model — that a leading slash means "relative path" — is only true when the slash is singular. Backslash (`\`) is included in the negative lookahead because several browsers normalise `\/evil.com` to `//evil.com` before the request leaves the client.

---

### Issue 2: HTTP header injection via newlines

**Problem:** If `return_to` contains a carriage-return or line-feed character (e.g. `/dashboard\r\nSet-Cookie: session=attacker`), PHP's `header()` call emits those bytes verbatim into the HTTP response, splitting the header block and letting an attacker inject arbitrary headers or a second response body.

**Fix:** Add `preg_match('/[\r\n]/', $returnTo)` to the guard condition; if the value contains any CR or LF, `$returnTo` is reset to `'/'` before `header()` is called.

**Explanation:** `header()` in PHP does not strip newlines from the string it receives. An HTTP header ends at the first CRLF, so embedding `\r\n` inside the `Location` value terminates that header and starts a new one. Older PHP versions threw a warning on this; current versions are stricter in some SAPIs but not all, and the safe practice is to never let user-controlled data reach `header()` without sanitising line endings. The fix is intentionally placed alongside the path-shape check so both validations fail fast together.

---

### Issue 3: Missing same-origin enforcement

**Problem:** Even with the regex fix in place, a future code path that sets `$_SESSION['return_to']` to a full absolute URL like `https://evil.com/` would bypass the check, because an absolute URL does not start with `/` at all — but the regex already catches that. The deeper risk is that `parse_url` may extract a `host` from values that look path-like but embed credentials or unusual syntax (e.g. `//evil.com` variants not caught by the regex on every PHP version).

**Fix:** After the regex guard, call `parse_url($returnTo)` and check whether the result contains a non-empty `'host'` key. If it does, reset `$returnTo` to `'/'`.

**Explanation:** Defence in depth is warranted here because open-redirect impact is elevated in an SSO callback — the victim has no reason to distrust the destination after completing real authentication. `parse_url` uses a different parsing engine than the regex, so the two checks cover different edge cases rather than duplicating work. For example, `parse_url` will set `host` for inputs like `//x:80/path` even if the regex is slightly mis-anchored in a future edit. Keeping both layers means a single bypass of one check does not immediately yield a working exploit.
