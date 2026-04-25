## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Null Coercion in Permission Check
// ------------------------------------------------------------------------

<?php
// lib/acl.php

function can_access_resource(PDO $pdo, int $user_id, int $resource_id): bool
{
    $stmt = $pdo->prepare(
        'SELECT org_id FROM resources WHERE id = ?'
    );
    $stmt->execute([$resource_id]);
    $resource = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$resource) {
        return false; // resource doesn't exist
    }

    // CHANGE 2: Explicitly handle NULL org_id ("global" resources). Grant access to all authenticated users, or deny — policy decision made here rather than falling through to a broken comparison.
    if ($resource['org_id'] === null) {
        return true; // global resource: accessible by any authenticated user
    }

    $stmt2 = $pdo->prepare(
        'SELECT org_id FROM users WHERE id = ?'
    );
    $stmt2->execute([$user_id]);
    $user_org_id = $stmt2->fetchColumn();

    // CHANGE 3: Guard against fetchColumn() returning false (user row missing); false would equal NULL under loose equality and grant access.
    if ($user_org_id === false) {
        return false; // user not found
    }

    // CHANGE 1: Use strict equality (===) instead of loose (==) so NULL, false, 0, and "" can never accidentally compare equal to a valid org_id integer.
    return $resource['org_id'] === (int) $user_org_id;
}
```

## Explanation

### Issue 1: Loose equality allows NULL/falsy collisions

**Problem:** The original `return $resource['org_id'] == $user_org_id` uses PHP's loose `==` operator. Under loose comparison, `NULL == 0` is `true`, `NULL == false` is `true`, and `NULL == ""` is `true`. Any resource whose `org_id` is NULL therefore matches a wide range of user org values, letting tenants see data they shouldn't.

**Fix:** Replace `==` with `===` and cast `$user_org_id` to `int` so both sides share the same type: `$resource['org_id'] === (int) $user_org_id`.

**Explanation:** PHP's type-juggling rules convert both sides to a common type before `==` compares them. NULL becomes 0 in numeric contexts, so `NULL == 0` evaluates to `true`. A legitimate user whose org_id is, say, `5` will have `5 == NULL` evaluate to `false` — but a user whose row somehow produces `0` or `false` from `fetchColumn()` would get `true`. Strict `===` requires both value and type to match, so `NULL === 5` is always `false`. Casting `$user_org_id` with `(int)` ensures the right-hand side is always an integer, preventing any residual string-vs-integer looseness that PDO might introduce when fetching.

---

### Issue 2: NULL org_id has no explicit policy

**Problem:** The ETL team deliberately imports "global" resources with a NULL `org_id`, but the code has no branch for that case. Without an explicit check, the comparison runs anyway and produces a result that depends entirely on PHP type coercion — not on an intentional access rule.

**Fix:** Add an early return immediately after the resource-existence check: `if ($resource['org_id'] === null) { return true; }`. This makes the global-resource policy explicit and visible.

**Explanation:** Relying on a comparison to implicitly handle a special sentinel value (NULL) is fragile — the behavior changes if the comparison operator changes, or if the other operand changes type. Writing the policy as an explicit branch (`=== null` check) documents the decision in code, makes it easy to change (e.g., swap to `return false` to lock global resources down), and prevents the comparison below from ever receiving a NULL left-hand side. If the policy should be "deny" rather than "allow" for global resources, only one word changes in one place.

---

### Issue 3: fetchColumn returns false when user row is missing

**Problem:** `PDOStatement::fetchColumn()` returns `false` (not NULL and not 0) when no row is found. If the user row doesn't exist in the database, `$user_org_id` is `false`. Under the original loose `==`, `false == NULL` is `true`, so a missing user would be granted access to any NULL-org resource.

**Fix:** Add `if ($user_org_id === false) { return false; }` immediately after `fetchColumn()` to short-circuit before the comparison.

**Explanation:** PDO uses `false` as a sentinel return from `fetchColumn()` to signal "no row", not a PHP NULL. This is easy to miss because `false` and `NULL` look similar in many contexts. With the strict `===` fix from Issue 1 already in place, `false === 5` would correctly return `false`, but the explicit guard makes the "user not found" case self-documenting and protects against any future loosening of the comparison. It also prevents accidentally granting access if a future code path introduces a NULL-org resource that somehow bypasses the Issue 2 guard.
