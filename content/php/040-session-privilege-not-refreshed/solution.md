## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Stale Session Privilege Escalation
// ------------------------------------------------------------------------

<?php
// admin/promote.php

session_start();

if ($_SESSION['role'] !== 'super_admin') {
    http_response_code(403);
    exit('Forbidden');
}

// CHANGE 2: Validate CSRF token before processing any state-changing action to prevent cross-site request forgery.
if (empty($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $_POST['csrf_token'])) {
    http_response_code(403);
    exit('Invalid CSRF token');
}

// CHANGE 3: Set PDO error mode to exceptions so a failed connection or query surfaces immediately rather than silently continuing.
$conn = new PDO(
    'mysql:host=localhost;dbname=app',
    'app',
    'secret',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$targetId  = (int) $_POST['user_id'];
$newRole   = $_POST['role']; // 'admin' or 'user'

$allowed = ['admin', 'user'];
if (!in_array($newRole, $allowed, true)) {
    exit('Invalid role');
}

$stmt = $conn->prepare('UPDATE users SET role = ? WHERE id = ?');
$stmt->execute([$newRole, $targetId]);

// CHANGE 1: Destroy all session data belonging to the affected user so their next request re-reads the role from the database, preventing stale-session privilege escalation in both directions (promotion and revocation).
$sessionName = session_name();
session_write_close();

$otherStmt = $conn->prepare('SELECT session_id FROM user_sessions WHERE user_id = ?');
$otherStmt->execute([$targetId]);
$sessionIds = $otherStmt->fetchAll(PDO::FETCH_COLUMN);

foreach ($sessionIds as $sid) {
    session_id($sid);
    session_start();
    // CHANGE 1 (continued): Overwrite the role key immediately in the target session so it is consistent even before the user's next full login cycle.
    $_SESSION['role'] = $newRole;
    session_write_close();
}

session_id('');
session_start();

header('Location: /admin/users.php?updated=1');
exit;
```

## Explanation

### Issue 1: Stale session role after database update

**Problem:** When a user logs in, their `role` is written into `$_SESSION['role']` and never refreshed from the database again. After `promote.php` updates the `role` column, the target user's active session still carries the old role. A newly promoted admin sees 403 errors on admin pages; a revoked admin keeps full access until their session expires or they log out manually.

**Fix:** After executing the `UPDATE`, the code opens each of the affected user's sessions (looked up from a `user_sessions` table that maps `user_id` to PHP session IDs) and overwrites `$_SESSION['role']` with the new role, then calls `session_write_close()` to persist the change (`CHANGE 1`).

**Explanation:** PHP stores session data server-side keyed by the session ID cookie. The application reads `$_SESSION['role']` on every request, but that value was stamped at login time and is never reconciled with the database afterward. The database `UPDATE` changes the authoritative record, but the live session file is untouched, so the divergence persists until the session is destroyed. Directly mutating the target user's session file via `session_id($sid); session_start();` forces the in-memory cache to match the database immediately. A simpler alternative for smaller apps is to always look up the role from the database on each request rather than trusting the session copy, which removes the staleness problem entirely.

---

### Issue 2: Missing CSRF protection on role-change endpoint

**Problem:** `promote.php` accepts any `POST` request that includes a valid `user_id` and `role`. An attacker can embed a hidden form on an external page that auto-submits to this endpoint; if a super-admin visits that page while logged in, their browser sends the session cookie and the role change executes without their knowledge.

**Fix:** A synchronizer token check is added at the top of the file (`CHANGE 2`): the code reads `$_POST['csrf_token']`, compares it with `$_SESSION['csrf_token']` using `hash_equals`, and returns 403 if they do not match.

**Explanation:** CSRF works because browsers automatically attach cookies to cross-origin requests. The server cannot distinguish a legitimate form submission from one forged by a third-party page. A CSRF token is a secret value embedded in the legitimate form that the attacker cannot read due to the same-origin policy. `hash_equals` is used instead of `===` to prevent timing-based token leakage, though for CSRF tokens the practical risk of timing attacks is low. The token must be generated once per session (or per form render) and stored server-side in `$_SESSION['csrf_token']`.

---

### Issue 3: Silent PDO failure due to missing error mode

**Problem:** By default, PDO uses `PDO::ERRMODE_SILENT`, meaning a failed connection or a failed `execute()` call returns `false` instead of throwing an exception. The script then calls `header('Location: ...')` and exits, giving the user a success redirect even though nothing was written to the database.

**Fix:** The `PDO` constructor receives a fourth argument `[PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]` (`CHANGE 3`), so any database error immediately throws a `PDOException` that halts execution with a visible error rather than silently continuing.

**Explanation:** Silent mode was the PDO default before PHP 8.0, where `ERRMODE_EXCEPTION` became the default. In silent mode, `$conn->prepare(...)` returns `false` on failure, and calling `->execute()` on `false` triggers a fatal error or a warning depending on PHP configuration — neither of which produces a clear audit trail. With exception mode, the stack unwinds immediately, the redirect never fires, and error logging captures the full context. If you rely on a custom exception handler or a framework error page, make sure those do not leak the DSN string or credentials in their output.
