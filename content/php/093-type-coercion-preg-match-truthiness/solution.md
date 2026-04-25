## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Truthy preg_match Return Skips Validation
// ------------------------------------------------------------------------

<?php
// lib/validators.php

function validate_username(string $input): bool
{
    // Must be 3-30 chars, alphanumeric + underscores only
    $result = preg_match('/^[a-z0-9_]{3,30}$/', $input);
    // CHANGE 1: Use strict equality `=== 1` instead of `!$result == false`; the old expression evaluated as `(!$result) == false` due to operator precedence, making it truthy when $result is 0 (no match) or false (error).
    // CHANGE 2: Comparing to exactly 1 means preg_match returning false (regex engine error) is treated as non-matching, so errors no longer silently pass validation.
    return $result === 1;
}

// lib/user_setup.php

function create_user_directory(string $username): void
{
    if (!validate_username($username)) {
        throw new InvalidArgumentException('Invalid username');
    }
    $base = '/var/app/userdata/';
    mkdir($base . $username, 0750, true);
}
```

## Explanation

### Issue 1: Operator Precedence Inverts Validation Logic

**Problem:** The expression `!$result == false` does not mean "result is not false". PHP parses it as `(!$result) == false`. When `preg_match` returns `0` (input does not match the pattern), `!0` is `true`, and `true == false` is `false`, so the function returns `false` — correct so far. But when `preg_match` returns `1` (input matches), `!1` is `false`, and `false == false` is `true`, so the function returns `true`. That part also seems correct. The trap springs when `preg_match` returns `false` (error): `!false` is `true`, and `true == false` is `false`, making the function return `false` — apparently blocking access. The confusion is that the intent was to allow matches and block everything else, but any sufficiently unusual input that triggers an error also appears blocked, masking the real logic inversion.

**Fix:** Replace `!$result == false` with `$result === 1` at the `CHANGE 1` site. This is a direct strict-equality check against the one value `preg_match` returns on a successful match.

**Explanation:** PHP's `!` (logical NOT) has higher precedence than `==` (loose equality), so `!$result == false` groups as `(!$result) == false`. A developer reading left-to-right expects it to mean "result is not equal to false", but that would require parentheses: `!($result == false)`. Using `=== 1` removes all ambiguity: the function returns `true` only when `preg_match` signals an actual match, and returns `false` for both no-match (`0`) and error (`false`). A related pitfall is using `== true` instead, which would also pass for any non-zero, non-empty value — strict equality to `1` is the only safe form here.

---

### Issue 2: preg_match Error Return Not Distinguished from No-Match

**Problem:** `preg_match` returns three distinct values — `1` (match), `0` (no match), and `false` (error, e.g. due to catastrophic backtracking, PCRE internal limits, or a malformed pattern). Code that treats `false` the same as `0` silently swallows regex engine failures. Depending on surrounding logic, this can either block all users (if the error is permanent) or, combined with the precedence bug above, allow unvalidated input through.

**Fix:** The `=== 1` strict comparison at the `CHANGE 2` site inherently handles this: `false === 1` is `false`, so any regex engine error causes `validate_username` to return `false`, which blocks the input rather than passing it.

**Explanation:** PHP's loose comparison treats `false` and `0` as equal (`false == 0` is `true`), so any code doing `if ($result)` or `if ($result != false)` cannot tell whether the regex failed to match or failed to run. Strict comparison (`=== 1`) uses both value and type, so `false` and `0` produce different outcomes from `1`. In a security-sensitive path like constructing a filesystem directory name, it is correct to fail closed: if the validator cannot determine whether the input is safe, it should reject the input. A concrete scenario where `preg_match` returns `false` is when the subject string exceeds the `pcre.backtrack_limit` or `pcre.recursion_limit` PHP ini values, which an attacker could potentially trigger with a very long crafted string.
