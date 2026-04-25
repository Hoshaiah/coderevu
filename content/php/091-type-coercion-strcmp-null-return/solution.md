## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — strcmp Returns Null on Array Input
// ------------------------------------------------------------------------

<?php
// src/Auth/TokenValidator.php

class TokenValidator
{
    private string $expectedToken;

    public function __construct()
    {
        $this->expectedToken = (string) getenv('API_SECRET_TOKEN');
    }

    public function validate(mixed $suppliedToken): bool
    {
        // CHANGE 1: Reject any non-string input immediately; strcmp() on an array returns NULL (not an integer), so === 0 would never be true after this guard, but more importantly we refuse to process malformed types at all.
        // CHANGE 2: is_string() also prevents a non-empty array from slipping past empty() — empty(['x']) is false, so the old empty() guard did not catch non-empty arrays.
        if (!is_string($suppliedToken) || $suppliedToken === '') {
            return false;
        }

        // CHANGE 3: Replace strcmp() with hash_equals() for a constant-time comparison that is not vulnerable to timing-based token enumeration; hash_equals() also requires both arguments to be strings, which is now guaranteed by the guard above.
        if (hash_equals($this->expectedToken, $suppliedToken)) {
            return true;
        }

        return false;
    }
}
```

## Explanation

### Issue 1: `strcmp()` returns `NULL` for array arguments

**Problem:** When an attacker sends the token as an array (e.g. `token[]=anything` in a form body or a JSON array), PHP passes that array to `strcmp()`. PHP's `strcmp()` is not type-safe: passing a non-string triggers a deprecation warning in PHP 8 but still returns `NULL`. `NULL === 0` is `false`, so on its own that would reject the request — except that in older PHP versions and some SAPI configurations the warning is suppressed and the return value comparison quietly fails in a permissive direction. Regardless of PHP version, the real fix is to never let the array reach `strcmp()` at all.

**Fix:** A `!is_string($suppliedToken)` check is added at the top of `validate()` (CHANGE 1). If the supplied value is not a plain string, the function returns `false` immediately before any comparison is attempted.

**Explanation:** PHP's built-in string functions were designed for strings. When you pass an array, the behavior is implementation-defined: PHP 8.0 throws a `TypeError` from some functions and a deprecation from others, but `strcmp()` historically returned `NULL` with only a notice. Because the middleware caught no exceptions and logged no warnings in this service, the `NULL` return propagated silently. Forcing an early `is_string()` check makes the type contract explicit and removes the ambiguity entirely — no matter what PHP version is running.

---

### Issue 2: `empty()` does not catch non-empty arrays

**Problem:** The early guard `if (empty($suppliedToken))` is intended to reject blank tokens, but `empty()` returns `false` for any non-empty array because a non-empty array is considered truthy. So `empty(['anything'])` is `false`, the guard passes, and the array reaches `strcmp()`.

**Fix:** The `empty()` check is replaced with `!is_string($suppliedToken) || $suppliedToken === ''` (CHANGE 2). This explicitly rejects arrays, objects, integers, and every other non-string type, plus the empty-string case.

**Explanation:** `empty()` was designed to cover a broad set of "falsy" values (`0`, `""`, `null`, `[]`), but a non-empty array like `['x']` is not falsy. The original developer likely intended `empty()` as a shorthand for "nothing useful was supplied", but that assumption breaks down as soon as the input type is not controlled. Replacing it with a strict type-and-value check closes the gap. A related pitfall: `empty()` on `"0"` also returns `true`, which could cause legitimate tokens that happen to be the string `"0"` to be rejected — another reason to prefer an explicit string check.

---

### Issue 3: `strcmp()` is not timing-safe

**Problem:** `strcmp()` returns as soon as it finds the first differing byte. An attacker who can measure response latency with enough precision can enumerate the correct token one character at a time, because a token that shares a longer prefix with the real token takes fractionally longer to reject.

**Fix:** `strcmp(...) === 0` is replaced with `hash_equals($this->expectedToken, $suppliedToken)` (CHANGE 3). `hash_equals()` always compares every byte of both strings before returning, making the execution time independent of where the first mismatch occurs.

**Explanation:** Timing attacks against string comparison are practical in low-latency environments (same data-center, loopback, or repeated requests averaged over time). PHP's `hash_equals()` was added specifically to solve this for secret comparison scenarios. It requires both arguments to be strings — which is now guaranteed by CHANGE 1 — and internally uses a constant-time XOR loop. Note that `hash_equals()` does not hash its inputs; despite the name it simply does a constant-time byte comparison, so you can pass raw token strings directly without pre-hashing them.
