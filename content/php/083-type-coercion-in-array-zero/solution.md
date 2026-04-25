## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose in_array Matches Zero
// ------------------------------------------------------------------------

<?php
// src/Middleware/RoleMiddleware.php

require_once __DIR__ . '/../../bootstrap.php';

function require_role(array $allowed_roles): void
{
    // CHANGE 2: Only start a session if one is not already active to avoid duplicate-session warnings.
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    $user_id = $_SESSION['user_id'] ?? null;
    if ($user_id === null) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $pdo  = get_db_connection();
    $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }

    $user_role = $row['role'];  // e.g. 'viewer'

    // CHANGE 1: Pass `true` as the third argument to enable strict type comparison, preventing loose-type coercion that makes any string match integer 0 in the allowed list.
    if (!in_array($user_role, $allowed_roles, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
}

// Usage: require_role(['admin', 'superuser']);
require_role(['admin', 'superuser']);

echo json_encode(['data' => 'sensitive admin payload']);
```

## Explanation

### Issue 1: Loose `in_array` Bypasses Role Check

**Problem:** Any authenticated user whose session `user_id` is the integer `0` can access endpoints regardless of their actual role string. The audit log shows the request is genuinely granted by this middleware, not served from cache.

**Fix:** Add `true` as the third argument to `in_array` on the role-check line: `in_array($user_role, $allowed_roles, true)`. This switches the comparison from loose (`==`) to strict (`===`).

**Explanation:** PHP's `in_array` without a third argument uses loose (`==`) comparison. When PHP loosely compares a string like `'viewer'` to the integer `0`, it first casts `'viewer'` to an integer. A string with no leading digits casts to `0`, so `'viewer' == 0` is `true`. This means every string role matches `0` — and if `0` is in `$allowed_roles` (e.g., because the legacy seed user's ID is `0` and some code path inadvertently placed it there), or more precisely, if the user ID stored in the session is `0` and the role strings themselves cast to `0`, the check passes for all roles. Passing `true` as the strict flag makes `in_array` use `===`, so `'viewer' === 'admin'` is `false` and the bypass is closed. Any time you compare user-supplied or database-sourced values, always use strict mode to avoid type-juggling surprises.

---

### Issue 2: Unconditional `session_start` May Conflict With Active Session

**Problem:** Calling `session_start()` when a session is already open triggers an `E_NOTICE` (PHP 7) or is silently ignored depending on configuration. In strict error-reporting environments it can also corrupt response headers.

**Fix:** Wrap `session_start()` in a guard: `if (session_status() === PHP_SESSION_NONE) { session_start(); }`. This is the CHANGE 2 site at the top of the function.

**Explanation:** `session_status()` returns `PHP_SESSION_ACTIVE` if a session is already running. Calling `session_start()` again in that state is redundant and, on some PHP/web-server combinations, emits warnings or sends duplicate `Set-Cookie` headers. A middleware function can be called in contexts where the bootstrap or a prior middleware already opened a session, so the guard makes the function safe to call in any order. This is a defensive hygiene fix rather than the root cause of the privilege bypass, but it prevents subtle environment-specific failures.
