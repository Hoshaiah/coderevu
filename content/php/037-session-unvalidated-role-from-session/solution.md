## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Role Fetched From Session Only
// ------------------------------------------------------------------------

<?php
// middleware/RoleMiddleware.php

session_start();

// CHANGE 1: Accept a PDO instance so the role can be fetched from the database on every request instead of trusting the session cache.
function requireRole(string $requiredRole, PDO $pdo): void
{
    if (!isset($_SESSION['user_id'])) {
        header('Location: /login.php');
        exit;
    }

    // CHANGE 1: Query the database for the current role on every request so that a role change made by an admin takes effect immediately, regardless of the session state.
    $stmt = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $_SESSION['user_id']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    // CHANGE 2: If the user row no longer exists or the fetched role does not match, deny access — this prevents a stale or tampered session value from granting elevated privileges.
    if ($row === false || $row['role'] !== $requiredRole) {
        http_response_code(403);
        echo 'Access denied.';
        exit;
    }
}

// CHANGE 1: Pass the $pdo connection so requireRole can reach the database.
global $pdo; // $pdo is assumed to be initialised in a bootstrap file included before this middleware.
requireRole('admin', $pdo);
```

## Explanation

### Issue 1: Role Read From Session Cache

**Problem:** When a superadmin demotes a user in the database, the change has no effect on that user's active session. The session still holds the old `role` value, so `requireRole` keeps granting access until the session naturally expires — potentially hours later.

**Fix:** Replace `$_SESSION['role'] ?? 'user'` with a live `SELECT role FROM users WHERE id = :id` query using the injected `$pdo` connection. The function signature becomes `requireRole(string $requiredRole, PDO $pdo)` and the call site passes `$pdo`.

**Explanation:** PHP sessions are stored server-side but their contents are only written at the start of the session and updated when the application explicitly sets `$_SESSION` values. Nothing in this code ever refreshes `$_SESSION['role']` from the database after login, so a superadmin change to the `role` column is invisible to the running session. By fetching the role directly from the database on every request, the middleware always sees the current authoritative value. The trade-off is one extra SELECT per admin page load, which is acceptable for a small admin surface and is the standard approach when role changes must take effect immediately. If that query becomes a bottleneck, a short-lived cache (e.g. Redis with a TTL of 30–60 seconds) is a safer middle ground than a session-lifetime cache.

---

### Issue 2: Stale or Missing User Row Not Rejected

**Problem:** If `$_SESSION['user_id']` references a user that has been deleted, or if the database returns no row, `$row` is `false` and `$row['role']` would be an array-access on a non-array value. The original code would also silently grant `user`-level access in that case because it falls back to `'user'`.

**Fix:** Add an explicit `$row === false` check in the condition: `if ($row === false || $row['role'] !== $requiredRole)`. This short-circuits to a 403 if the user no longer exists in the database before attempting to read `$row['role']`.

**Explanation:** `PDOStatement::fetch` returns `false` when there are no matching rows. Accessing `$row['role']` when `$row` is `false` raises a PHP warning and produces `null`, which would pass the `!== $requiredRole` check and correctly deny access — but only by accident, and with a warning. The explicit `$row === false` guard makes the intent clear and avoids relying on the side effect of a type mismatch. A related pitfall: if the users table ever stores an empty string in the `role` column, `null !== $requiredRole` would still deny access, but the reason would be silently wrong — always validate that the fetched value is a non-empty string if your schema allows nullable roles.
