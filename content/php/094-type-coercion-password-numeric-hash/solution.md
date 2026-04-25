## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Numeric String Password Bypass
// ------------------------------------------------------------------------

<?php
// src/Api/V2/AuthController.php

class AuthController
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function login(array $body): array
    {
        $email = $body['email'] ?? '';
        $pin   = $body['pin']   ?? '';

        // CHANGE 2: Validate that pin is a numeric string of 4–6 digits before proceeding; rejects empty, non-numeric, and out-of-range values that could slip through to the hash comparison.
        if (!is_string($pin) && !is_int($pin)) {
            return ['success' => false, 'error' => 'Invalid credentials'];
        }
        $pinStr = (string) $pin;
        if (!preg_match('/^\d{4,6}$/', $pinStr)) {
            return ['success' => false, 'error' => 'Invalid credentials'];
        }

        $stmt = $this->pdo->prepare(
            "SELECT id, pin_hash FROM users WHERE email = ?"
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return ['success' => false, 'error' => 'Invalid credentials'];
        }

        $submitted = md5($pinStr);

        // CHANGE 1: Use hash_equals() instead of == so the comparison is both type-safe (strict string equality) and timing-safe, eliminating the 0e scientific-notation bypass entirely.
        if (hash_equals($user['pin_hash'], $submitted)) {
            return ['success' => true, 'user_id' => $user['id']];
        }

        return ['success' => false, 'error' => 'Invalid credentials'];
    }
}
```

## Explanation

### Issue 1: Loose String Comparison Bypasses PIN Check

**Problem:** Any user whose stored `pin_hash` starts with `0e` followed only by digits can be logged in by submitting the PIN `0` (or any PIN whose MD5 also matches that pattern). PHP's `==` operator treats both strings as floating-point numbers in scientific notation, so `"0e12345" == "0e99999"` is `true` even though the hashes are different strings.

**Fix:** Replace `$submitted == $user['pin_hash']` with `hash_equals($user['pin_hash'], $submitted)`. `hash_equals()` compares two strings byte-by-byte and returns `true` only when they are identical, ignoring any numeric interpretation.

**Explanation:** PHP's loose comparison coerces operands to a common type before comparing. When both strings look like a number in scientific notation (e.g., `0e32` is `0 × 10³²` = `0.0`), PHP converts both to `float` and compares the resulting values — so any two such strings compare equal regardless of their digits. MD5 produces hex output, and roughly 1-in-256 hashes start with `0e` followed by hex digits that happen to all be numeric (`0`–`9`), making them vulnerable. `hash_equals()` always does a strict, constant-time byte comparison, so it is immune to both the type-coercion bug and timing side-channels. A related pitfall: `===` would also fix the type-coercion bug, but `hash_equals()` is preferred because it additionally prevents timing-based hash enumeration.

---

### Issue 2: No Validation on PIN Input Type or Format

**Problem:** The PIN arrives as a JSON value, which `json_decode` maps to a PHP `int` when it has no quotes. There is no check that `$pin` is actually a 4–6 digit number before it is cast and hashed. An empty string, `null`, a float like `0.0`, or a very long integer all pass through silently and may produce unexpected hashes or error states.

**Fix:** Add an explicit type and format check — `is_string($pin) || is_int($pin)` followed by `preg_match('/^\d{4,6}$/', $pinStr)` — immediately after extracting `$pin` from the body, returning an error for anything that fails. The validated value is stored in `$pinStr` and used in the `md5()` call below.

**Explanation:** When the mobile client sends `{"pin": 0}`, PHP receives an `int` `0`, which `(string) $pin` converts to `"0"`. Without format validation, a single-digit or empty value reaches `md5()` and is compared against stored hashes. The regex `/^\d{4,6}$/` enforces that only 4–6 digit strings proceed, which matches the product requirement for PINs and discards edge cases like empty strings, negative numbers, or floats before they can interact with the hash comparison. Placing this validation before the database query also avoids a pointless round-trip when the input is obviously malformed.
