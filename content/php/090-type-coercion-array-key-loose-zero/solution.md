## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose Array Search Matches Wrong Key
// ------------------------------------------------------------------------

<?php
// auth/Permissions.php

function can(string $role, string $action, array $permissions): bool
{
    if (!array_key_exists($role, $permissions)) {
        return false;
    }

    $allowed = $permissions[$role];

    // Check if the action is in the allowed list for this role
    // CHANGE 1: pass true as the third argument to force strict (===) comparison, preventing int 0 from loosely matching string values
    return in_array($action, $allowed, true);
}

// Example permissions loaded from config:
$permissions = [
    'admin'  => ['create', 'read', 'update', 'delete'],
    'editor' => ['create', 'read', 'update'],
    'viewer' => ['read'],
];

// Called from a delete handler:
$role   = 'viewer';
// CHANGE 2: action must be a string to match the type contract of can() and to compare correctly against the string-keyed allowed list
$action = 'read';  // was: $action = 0; — integer 0 caused loose-match against every string

if (can($role, $action, $permissions)) {
    echo "Permitted";
}
```

## Explanation

### Issue 1: `in_array` Loose Comparison Grants False Access

**Problem:** A user with the role `'viewer'` can perform `'delete'` actions that should be restricted to `'admin'`. The bug appears intermittently depending on array ordering, and produces no warnings even with strict error reporting enabled.

**Fix:** Add `true` as the third argument to `in_array()` at the `CHANGE 1` site, changing the call from `in_array($action, $allowed)` to `in_array($action, $allowed, true)`.

**Explanation:** PHP's `in_array()` defaults to loose (`==`) comparison. Under loose comparison, the integer `0` equals any string that is not purely numeric, because PHP coerces the string to an integer (yielding `0`) before comparing. So `0 == 'create'`, `0 == 'read'`, `0 == 'delete'` all evaluate to `true`. Passing `true` as the strict flag switches to `===` comparison, which checks both value and type, so `0 === 'delete'` is `false`. The bug is order-dependent because the function returns on first match; if the array happened to start with a purely numeric string (e.g. `'0'`), loose comparison would still match on position 0 but the visible effect differed. Strict mode eliminates the entire class of type-coercion surprises.

---

### Issue 2: Integer Passed Where String Action Is Expected

**Problem:** The upstream delete handler sets `$action = 0` (an integer) instead of a string like `'delete'`. PHP's scalar type coercion in non-strict mode silently casts the `0` to the empty string `''` when it crosses the `string $action` type boundary, but in many configurations it reaches `in_array` as `0`, triggering the loose-match bug.

**Fix:** At the `CHANGE 2` site, replace `$action = 0` with the correct string value, e.g. `$action = 'read'`, so the value matches the `string` type contract declared on `can()`.

**Explanation:** When PHP runs without `declare(strict_types=1)`, a function with a `string` parameter hint will coerce an integer argument rather than throw a `TypeError`. That means `can()` receives `''` (empty string from coercing `0`) or, depending on PHP version and context, the raw `0` — neither of which represents a valid action name. The fix makes the caller pass an actual action string, which is the only value that can ever legitimately match an entry in the allowed list. Adding `declare(strict_types=1)` at the top of the file would make PHP throw a `TypeError` immediately if an integer is passed in the future, preventing silent coercion from masking this category of mistake again.
