## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Session data is deserialized from a user-controlled cookie, enabling remote code execution
// ------------------------------------------------------------------------
<?php
// middleware/load_preferences.php

/**
 * Load user preferences from the signed cookie, falling back to defaults.
 */
function load_user_preferences(): UserPreferences
{
    $cookie = $_COOKIE['user_prefs'] ?? null;

    if ($cookie !== null) {
        // CHANGE 2: Verify HMAC signature before trusting any cookie data. The cookie is now stored as "<hmac>.<base64payload>"; if the signature does not match we discard the value entirely.
        $secret = defined('COOKIE_HMAC_SECRET') ? COOKIE_HMAC_SECRET : '';
        $dotPos = strpos($cookie, '.');
        if ($dotPos === false) {
            return new UserPreferences();
        }
        $providedMac = substr($cookie, 0, $dotPos);
        $payload     = substr($cookie, $dotPos + 1);
        $expectedMac = hash_hmac('sha256', $payload, $secret);
        // Constant-time comparison prevents timing-oracle attacks.
        if (!hash_equals($expectedMac, $providedMac)) {
            return new UserPreferences();
        }

        // CHANGE 3: Validate that base64_decode produced a non-empty string before passing it to any further processing.
        $data = base64_decode($payload, true);
        if ($data === false || $data === '') {
            return new UserPreferences();
        }

        // CHANGE 1: Replace unserialize() with JSON decode restricted to a plain associative array.  JSON carries no class information, so no object is instantiated and no magic methods (__wakeup, __destruct) can fire.  UserPreferences is reconstructed manually from the data.
        $decoded = json_decode($data, true);
        if (!is_array($decoded)) {
            return new UserPreferences();
        }

        $prefs = new UserPreferences();
        // Accept only the known scalar fields; ignore anything else.
        if (isset($decoded['theme']) && is_string($decoded['theme'])) {
            $prefs->theme = $decoded['theme'];
        }
        if (isset($decoded['language']) && is_string($decoded['language'])) {
            $prefs->language = $decoded['language'];
        }
        if (isset($decoded['pageSize']) && is_int($decoded['pageSize'])) {
            $prefs->pageSize = $decoded['pageSize'];
        }
        return $prefs;
    }

    return new UserPreferences();
}

class UserPreferences
{
    public string $theme    = 'light';
    public string $language = 'en';
    public int    $pageSize = 25;
}
```

## Explanation

### Issue 1: Unsafe deserialization enables arbitrary code execution

**Problem:** `unserialize()` reconstructs any PHP class whose definition is available at runtime. An attacker who can control the cookie value can craft a serialized payload that instantiates an autoloaded class with a destructive `__destruct` or `__wakeup` method. When PHP deserializes the object, that magic method fires automatically — even before the `instanceof` check — and can delete files, write arbitrary data, or chain into remote code execution.

**Fix:** Remove the `unserialize()` call entirely. Replace it with `json_decode($data, true)` (CHANGE 1), which returns a plain PHP array. Each field of `UserPreferences` is then populated manually from that array after type-checking each value.

**Explanation:** PHP's `unserialize()` is a general-purpose object factory. When it sees `O:14:"SomeGadgetClass":1:{...}` in the input, it calls the autoloader, instantiates `SomeGadgetClass`, populates its properties, and then invokes `__wakeup`. None of this waits for application-level checks. JSON has no concept of a PHP class, so `json_decode` can never trigger magic methods. Populating `UserPreferences` field-by-field with explicit type checks means the application only ever produces a known, safe object regardless of what the cookie contains. A related pitfall: even after switching to JSON, always allowlist fields — silently copying all decoded keys onto the object would let an attacker inject unexpected properties.

---

### Issue 2: Cookie carries no integrity check, allowing payload substitution

**Problem:** The original code reads `$_COOKIE['user_prefs']` and immediately decodes it. There is nothing stopping an attacker from replacing the cookie with any value they choose — the application has no way to distinguish a legitimate cookie it issued from a forged one.

**Fix:** Add HMAC-SHA256 signing (CHANGE 2). The cookie is stored as `<hmac>.<base64payload>`. On read, the server splits on the first `.`, recomputes the HMAC over the base64 payload using a server-side secret, and uses `hash_equals()` to compare. If the signatures do not match, the function returns defaults immediately.

**Explanation:** Without a signature, an attacker edits the cookie in their browser and the server processes it as if it were its own output. An HMAC ties the payload to a secret key that only the server knows, so any modification to the payload produces a different MAC. `hash_equals()` is required instead of `===` because a naive string comparison leaks timing information that an attacker on a fast network could use to forge a valid MAC one byte at a time. The secret must be long, random, and stored in server configuration — not hardcoded.

---

### Issue 3: `base64_decode` result is used without checking for failure

**Problem:** `base64_decode()` returns `false` when given a string containing characters outside the base64 alphabet. The original code passes the return value directly to `unserialize()` without checking, so `unserialize(false)` runs and emits a notice while also potentially doing partial work depending on PHP version and configuration.

**Fix:** Call `base64_decode($payload, true)` with the strict flag and immediately check whether the result is `false` or an empty string (CHANGE 3). If either is true, return a fresh `UserPreferences` object.

**Explanation:** The `true` (strict mode) argument makes `base64_decode` reject any character not in the standard base64 alphabet, which catches URL-encoded or otherwise corrupted values early. Without the check, passing `false` downstream causes functions like `json_decode` or the former `unserialize` to operate on a non-string argument, producing warnings and unpredictable output. Failing fast here also means the HMAC check has already passed, so the only scenario that reaches this point is a legitimately signed but somehow malformed payload — returning defaults is the correct recovery.
