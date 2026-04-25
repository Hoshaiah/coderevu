## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Numeric JSON ID Loose Comparison
// ------------------------------------------------------------------------

<?php
// src/Middleware/OwnershipCheck.php

class OwnershipCheck
{
    public function handle(array $sessionData, string $rawBody): bool
    {
        $body   = json_decode($rawBody, true);
        $bodyId = $body['user_id'] ?? null;

        $sessionUserId = $sessionData['user_id'] ?? null;

        // CHANGE 2: Reject the request immediately if bodyId is not a plain integer, blocking booleans, floats, and strings before comparison.
        if (!is_int($bodyId)) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }

        // CHANGE 1: Use strict inequality (!==) instead of loose (!=) so that `true`, `1.0`, or "1" never match an integer session ID.
        if ($bodyId !== $sessionUserId) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }

        return true;
    }
}
```

## Explanation

### Issue 1: Loose Equality Bypass with Boolean

**Problem:** PHP's `!=` operator performs type-juggling before comparing values. When `bodyId` is `true` (a JSON boolean) and `sessionUserId` is any non-zero integer like `42`, `true != 42` evaluates to `false`, meaning the check passes and the request is allowed through. A penetration tester can exploit this by sending `{"user_id": true}` to impersonate any user whose ID is not zero.

**Fix:** Replace `!=` with `!==` at the comparison site (CHANGE 1). The strict operator checks both value and type, so `true !== 42` is `true` and the 403 branch fires.

**Explanation:** PHP's loose comparison converts operands to a common type before comparing. `true` cast to integer is `1`, but more broadly PHP treats `true` as equal to any non-zero number under `==`/`!=`. Strict comparison (`===`/`!==`) skips that coercion entirely and requires both operands to be the same type and value. Since `$sessionUserId` is always an `int` loaded from the database, `true !== $sessionUserId` will always be `true`, correctly blocking the payload. A related pitfall: `"1" != 1` is also `false` in PHP, so string IDs from untrusted input could match integer session IDs the same way.

---

### Issue 2: No Type Validation on Incoming `user_id`

**Problem:** The middleware accepts any JSON value for `user_id` — booleans, floats, strings, arrays — and passes it directly to the comparison. Even with strict equality fixing the immediate bypass, allowing arbitrary types into security-sensitive comparisons increases the attack surface and makes the code harder to reason about correctly.

**Fix:** Add an `is_int($bodyId)` check before the equality comparison (CHANGE 2). If `bodyId` is anything other than a PHP integer, the middleware immediately returns 403 without reaching the ID comparison.

**Explanation:** `json_decode` maps JSON booleans to PHP booleans, JSON numbers without decimals to PHP integers (or floats for large values), and JSON strings to PHP strings. The middleware has no control over what the client sends, so it must explicitly assert the expected type before using the value in a security decision. Checking `is_int` ensures that only values that `json_decode` produced as a native PHP integer proceed further. This also prevents edge cases like very large JSON numbers being decoded as floats (e.g., `9999999999999999.0`) which could behave unexpectedly under strict comparison against an integer session ID.
