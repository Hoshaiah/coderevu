## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose Comparison Bypasses API Key
// ------------------------------------------------------------------------

<?php
// api/middleware/auth.php

function authenticate_webhook(): void
{
    $expected = $_ENV['WEBHOOK_API_KEY'] ?? '';
    $provided = $_SERVER['HTTP_X_API_KEY'] ?? '';

    // CHANGE 2: Reject immediately if the stored key is not a 40-char hex string, preventing misconfigured deployments from becoming open endpoints.
    if (!preg_match('/^[0-9a-f]{40}$/i', $expected)) {
        http_response_code(500);
        echo json_encode(['error' => 'Server configuration error']);
        exit;
    }

    // CHANGE 1: Replace loose `==` with `hash_equals()` which uses strict, type-safe comparison and avoids type juggling bypasses like sending header value `0`.
    // CHANGE 3: `hash_equals()` performs a constant-time comparison, eliminating the timing side-channel present with `==` or `===`.
    if (hash_equals($expected, $provided)) {
        return; // authenticated
    }

    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

authenticate_webhook();
```

## Explanation

### Issue 1: Loose Comparison Type-Juggling Bypass

**Problem:** Sending the header value `0` authenticates successfully against any stored key that PHP treats as non-numeric. In PHP 7, when `==` compares a string to a numeric string or integer, PHP coerces both sides. The header `'0'` is numeric, so PHP converts the `$expected` hex key (e.g. `'a3f...'`) to `0` via `intval`, and `0 == 0` is `true`. The request is then passed to the handler without a valid key.

**Fix:** Replace `$expected == $provided` with `hash_equals($expected, $provided)`. `hash_equals()` requires both arguments to be strings and performs a strict byte-for-byte comparison with no type coercion.

**Explanation:** PHP's `==` operator applies type juggling rules: if either operand looks numeric, both are cast to numbers before comparing. The 40-character hex string `$expected` starts with a letter, so `intval('a3f...')` returns `0`. The attacker-supplied header `'0'` also becomes `0`. The equality holds and authentication is bypassed. Switching to `hash_equals()` removes all type coercion; it compares the raw string bytes. PHP 8 tightened some juggling rules but the safest fix is to avoid `==` on secrets entirely, regardless of PHP version.

---

### Issue 2: Missing Key Format Validation Allows Empty-Key Bypass

**Problem:** If `WEBHOOK_API_KEY` is missing or set to an empty string in the environment (a common misconfiguration during deployment), `$expected` becomes `''`. Any request that omits the `X-Api-Key` header also produces `$provided = ''`. The two empty strings compare equal, and every request passes authentication silently.

**Fix:** Add a `preg_match('/^[0-9a-f]{40}$/i', $expected)` guard before the comparison. If the stored key does not match the expected 40-character hex format, the middleware returns HTTP 500 and exits, making the misconfiguration visible rather than exploitable.

**Explanation:** Middleware that gates security should fail closed. When the key is absent or malformed, the safe behavior is to block all traffic and surface an error that operations can act on. Without this guard, a missing `.env` entry silently degrades the endpoint from authenticated to public. The 500 response also prevents the caller from learning anything about the expected key format.

---

### Issue 3: Non-Constant-Time Comparison Enables Timing Side-Channel

**Problem:** The `==` operator (and even `===`) short-circuits as soon as a mismatch is found. An attacker who can make many requests and measure response times can incrementally discover correct key bytes: requests whose prefix matches the real key take marginally longer before the comparison exits.

**Fix:** `hash_equals($expected, $provided)` (already introduced in CHANGE 1) runs in time proportional to the length of `$expected` regardless of where the first mismatch occurs, eliminating the timing signal.

**Explanation:** A string comparison that returns early on the first differing byte leaks information about how many bytes matched. Over thousands of requests an attacker can average out network jitter and detect that a key starting with `'a3'` takes slightly longer than one starting with `'00'`, then extend their guess byte by byte. `hash_equals()` was added to PHP specifically for this scenario; it always iterates the full length of the expected string. This attack is impractical against a single request but becomes realistic at scale or when an attacker controls multiple concurrent connections.
