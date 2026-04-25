## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose In-Array Role Check
// ------------------------------------------------------------------------

<?php
// lib/auth.php

// CHANGE 2: Declare strict types so the `string` type hints on require_role and has_role reject non-string arguments (e.g. integer 0 from a YAML config) with a TypeError instead of silently coercing them.
declare(strict_types=1);

function get_current_user_roles(): array {
    // Returns something like ['user', 'billing'] from the session
    return $_SESSION['roles'] ?? [];
}

function require_role(string $role): void {
    // Note: with strict_types=1, passing a non-string now throws a TypeError at the call site.
    $roles = get_current_user_roles();

    // CHANGE 1: Pass `true` as the third argument to in_array to enable strict (===) comparison, preventing integer 0 from matching any string role via PHP loose-type coercion.
    if (!in_array($role, $roles, true)) {
        http_response_code(403);
        exit(json_encode(['error' => 'Forbidden']));
    }
}

function has_role(string $role): bool {
    // CHANGE 1: Same strict comparison fix applied here for consistency.
    return in_array($role, get_current_user_roles(), true);
}
```

## Explanation

### Issue 1: `in_array` Loose Comparison Bypass

**Problem:** When `require_role` or `has_role` is called with the integer `0` (e.g. from a YAML config that parses an unquoted `0` as an integer), `in_array(0, ['user', 'billing'])` returns `true`. Every user passes the role check regardless of their actual roles.

**Fix:** Add `true` as the third argument in both `in_array` calls — `in_array($role, $roles, true)` — to enable strict type-and-value comparison using `===` instead of `==`.

**Explanation:** PHP's `in_array` defaults to loose comparison (`==`). When PHP compares an integer `0` to a string like `'user'` with `==`, it converts the string to a number: `'user'` becomes `0`, so `0 == 0` is `true`. This means `in_array(0, ['user', 'billing'])` matches on the very first element. With `strict=true`, the comparison uses `===`, which requires both type and value to match, so `0 === 'user'` is `false`. This is the minimal fix and makes the behaviour predictable regardless of what type the caller passes.

---

### Issue 2: Missing `declare(strict_types=1)` Allows Silent Type Coercion

**Problem:** The `string` type hint on `$role` looks like it protects against integer inputs, but without `declare(strict_types=1)` at the top of the file, PHP silently coerces an integer `0` to the string `'0'` when calling the function. The type hint provides no actual barrier, and callers in other files that also lack strict types will silently pass wrong types.

**Fix:** Add `declare(strict_types=1);` at the top of `lib/auth.php` so that passing a non-string value to `require_role` or `has_role` throws a `TypeError` immediately, making the problem visible at the call site.

**Explanation:** PHP's type coercion mode (the default, no strict declaration) automatically converts `0` (int) to `'0'` (string) to satisfy a `string` parameter type. The function then checks whether `'0'` is in the roles array — which it normally isn't — so the check technically fails rather than grants access in that specific coerced scenario, but the behaviour is surprising and fragile. More importantly, `declare(strict_types=1)` applies only to the file where it is declared, meaning calls originating from files without strict types are still coerced. The real benefit here is defence-in-depth: a `TypeError` at the call site makes misconfigured YAML values immediately visible during testing rather than producing subtle authorisation failures. The strict comparison fix in Issue 1 remains necessary even with this declaration, because a legitimate string `'0'` role name would still suffer the loose-comparison problem otherwise.
