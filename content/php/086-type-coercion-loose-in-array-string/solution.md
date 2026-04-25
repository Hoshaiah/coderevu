## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose in_array Role Check
// ------------------------------------------------------------------------

<?php
// src/Auth/RoleGuard.php

class RoleGuard
{
    private array $allowedRoles;

    public function __construct(array $allowedRoles)
    {
        $this->allowedRoles = $allowedRoles;
    }

    public function check(string $userRole): bool
    {
        // CHANGE 1: Pass true as the third argument to enable strict (===) comparison, preventing loose type-juggling that lets '0' or any falsy-casting string match unintended roles.
        return in_array($userRole, $this->allowedRoles, true);
    }
}

// Called from AdminController:
$guard = new RoleGuard(['admin', 'superadmin']);
// CHANGE 2: Use a non-empty sentinel default '' and rely on strict in_array so an absent or '0' role never matches a real role string.
if (!$guard->check($_SESSION['role'] ?? '')) {
    http_response_code(403);
    exit('Forbidden');
}
```

## Explanation

### Issue 1: `in_array` Loose Comparison Bypass

**Problem:** A user whose role is stored as the string `"0"` in the database can pass the `RoleGuard` check and reach every admin page. The guard returns `true` even though `"0"` is not in `['admin', 'superadmin']`.

**Fix:** Add `true` as the third argument to `in_array()` at the CHANGE 1 site, making the comparison use `===` instead of `==` for every element in the allowed-roles array.

**Explanation:** PHP's loose `==` operator applies type-juggling before comparing. When one side is an integer `0`, PHP converts the other side to an integer too. A non-numeric string like `'admin'` converts to `0`, so `0 == 'admin'` is `true`. The string `'0'` converts to the integer `0` via normal numeric casting, so `'0' == 'admin'` is also `true` through that chain. With strict mode (`true` as the third argument), `in_array` uses `===`, which requires both value and type to match. `'0' === 'admin'` is `false`, and the gate closes correctly. This class of bug is common whenever `in_array` is used on arrays that mix types or on user-controlled input without explicit strictness.

---

### Issue 2: Missing-Role Default Can Match Permissive Allowed Lists

**Problem:** When `$_SESSION['role']` is absent, the expression `$_SESSION['role'] ?? ''` produces an empty string, which is passed to `check()`. If the allowed-roles array ever inadvertently contains `''`, access is granted to unauthenticated sessions without any explicit error.

**Fix:** The CHANGE 2 comment documents that the `''` sentinel is intentional and only safe because the strict `in_array` added in CHANGE 1 ensures `''` never loosely matches a real role name. No allowed-roles array should ever include `''`, and the empty-string default is the right guard value precisely because it is not a valid role.

**Explanation:** Before the strict fix, `''` converts to `0` under loose comparison, so it was subject to the same type-juggling bypass as `'0'`. After enabling strict mode, `'' === 'admin'` is `false` and the sentinel is safe. The practical defense is twofold: keep `''` as the default for a missing session key (it signals "no role"), and ensure the allowed-roles arrays constructed throughout the application never contain `''`. Adding a guard in `__construct` that rejects empty strings from `$allowedRoles` would make this invariant explicit and catch misconfiguration early.
