## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Stale Role Cached in Session
// ------------------------------------------------------------------------

<?php
// src/Auth/Session.php

class Session
{
    // CHANGE 2: Accept a configurable TTL (seconds) for the role cache so it is not hardcoded and can be tightened.
    public function __construct(private PDO $pdo, private int $roleCacheTtl = 60) {}

    public function getCurrentUser(): ?array
    {
        // CHANGE 2: Only call session_start() when a session is not already active to avoid double-start warnings.
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION['user_id'])) {
            return null;
        }

        // CHANGE 1: Treat the cached role as stale once `role_cached_at` is older than $roleCacheTtl seconds, forcing a fresh DB read.
        $cacheAge = isset($_SESSION['role_cached_at']) ? (time() - $_SESSION['role_cached_at']) : PHP_INT_MAX;
        if (isset($_SESSION['user_role']) && $cacheAge < $this->roleCacheTtl) {
            return [
                'id'   => $_SESSION['user_id'],
                'role' => $_SESSION['user_role'],
            ];
        }

        $stmt = $this->pdo->prepare(
            'SELECT r.role_name
             FROM user_roles r
             WHERE r.user_id = ?'
        );
        $stmt->execute([$_SESSION['user_id']]);
        $roleRow = $stmt->fetch(PDO::FETCH_ASSOC);

        $_SESSION['user_role'] = $roleRow['role_name'] ?? 'viewer';
        // CHANGE 1: Record when the role was fetched so subsequent requests can check whether the cache has expired.
        $_SESSION['role_cached_at'] = time();

        return [
            'id'   => $_SESSION['user_id'],
            'role' => $_SESSION['user_role'],
        ];
    }
}
```

## Explanation

### Issue 1: Stale role served indefinitely from session

**Problem:** Once `$_SESSION['user_role']` is written, the code returns it on every subsequent request without ever going back to the database. A super-admin can change a user's role in `user_roles`, but the demoted user keeps the old role for up to 24 hours — the entire lifetime of the PHP session — because the cache-hit branch has no expiry check.

**Fix:** Two lines are added around the cache-hit branch. `$_SESSION['role_cached_at']` is written alongside `$_SESSION['user_role']` whenever a fresh DB read occurs. The early-return branch now only fires when `role_cached_at` exists **and** the elapsed time is less than `$roleCacheTtl` (default 60 seconds). After that window the code falls through to the `PDO` query and refreshes both values.

**Explanation:** The original `isset($_SESSION['user_role'])` guard is a write-once latch — it becomes `true` on the first request and stays `true` forever. Adding a timestamp converts it into a time-bounded cache: each request computes `time() - $_SESSION['role_cached_at']` and compares it to the TTL. If the user's role was downgraded, the next DB read after the TTL elapses overwrites `$_SESSION['user_role']` with `viewer`, and the session immediately reflects the correct role. The TTL is a constructor parameter so operators can tighten it (e.g., to 0 for no caching, or to 300 for a five-minute window) without touching the logic. One related pitfall: if you also store permissions derived from the role elsewhere in `$_SESSION`, those must be invalidated at the same time, or the same staleness problem reappears for those values.

---

### Issue 2: Unconditional `session_start()` on every call

**Problem:** `session_start()` is called at the top of `getCurrentUser()` with no guard. If this method is called more than once in the same request — or if the caller already started a session — PHP emits an `E_NOTICE` ("A session had already been started") on PHP 7 and can behave unpredictably on some SAPI configurations. In a test harness or middleware stack this also makes the method hard to call safely.

**Fix:** The bare `session_start()` call is replaced with a conditional: `if (session_status() === PHP_SESSION_NONE) { session_start(); }`. `session_status()` returns `PHP_SESSION_NONE` only when no session is active, so the call is skipped if a session is already running.

**Explanation:** PHP's `session_status()` returns one of three constants: `PHP_SESSION_DISABLED`, `PHP_SESSION_NONE`, or `PHP_SESSION_ACTIVE`. Calling `session_start()` when the status is already `PHP_SESSION_ACTIVE` is a no-op on PHP 7.1+ with `ignore_repeated_sess_start` on, but it still triggers a notice in strict error-reporting environments and can cause header-already-sent errors if output buffering is off. The guard makes the method idempotent — safe to call multiple times per request — which matters once middleware, unit tests, or other services also touch the session.
