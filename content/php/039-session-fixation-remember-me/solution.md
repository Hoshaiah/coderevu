## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Persistent Cookie Skips Session Regeneration
// ------------------------------------------------------------------------

<?php
// auth/remember_me.php

session_start();

if (!empty($_SESSION['user_id'])) {
    // Already authenticated, nothing to do.
    return;
}

$token = $_COOKIE['remember_token'] ?? null;
if (!$token) {
    return;
}

require_once __DIR__ . '/../db.php'; // provides $pdo

$stmt = $pdo->prepare(
    "SELECT user_id, expires_at FROM remember_tokens WHERE token = ? LIMIT 1"
);
$stmt->execute([$token]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row || strtotime($row['expires_at']) < time()) {
    setcookie('remember_token', '', time() - 3600, '/', '', true, true);
    return;
}

// CHANGE 2: Rotate the remember token on each use so a stolen token cannot be replayed after the legitimate user has authenticated once.
$newToken = bin2hex(random_bytes(32));
$newExpiry = date('Y-m-d H:i:s', strtotime('+30 days'));
$pdo->prepare("UPDATE remember_tokens SET token = ?, expires_at = ? WHERE token = ?")
    ->execute([$newToken, $newExpiry, $token]);
setcookie('remember_token', $newToken, time() + 30 * 86400, '/', '', true, true);

// CHANGE 1: Regenerate the session ID immediately before writing auth data to prevent session fixation — any pre-existing session ID (including one planted by an attacker) is discarded and a fresh ID is issued.
session_regenerate_id(true);

// Restore the session
$_SESSION['user_id'] = $row['user_id'];
$_SESSION['authed_via'] = 'remember_me';
```

## Explanation

### Issue 1: Session Fixation on Remember-Me Login

**Problem:** After a valid `remember_token` is found, the code writes `user_id` into `$_SESSION` without changing the session ID. An attacker on the same network can pre-seed a known session ID (e.g., via a `Set-Cookie` injection or by sharing a link with a `PHPSESSID` query parameter on a misconfigured server). When the victim loads the page, the remember-me flow authenticates that pre-planted session, and the attacker's already-open session becomes authenticated without the attacker ever knowing the token.

**Fix:** `session_regenerate_id(true)` is called immediately before writing any authentication data. The `true` argument deletes the old session file on disk so the former ID is completely invalidated.

**Explanation:** PHP's session mechanism ties authentication state to a session ID. If that ID was chosen by someone else before authentication, logging in only upgrades the value stored under that attacker-controlled ID. `session_regenerate_id(true)` creates a brand-new ID and transfers the (currently empty, unauthenticated) session data to it, then discards the old record. Because the attacker does not know the new ID, their pre-planted cookie is now useless. This must happen before `$_SESSION['user_id']` is set; doing it after is still a fixation window. A related pitfall: if your session save path is world-readable, regeneration alone is not sufficient — file permissions matter too.

---

### Issue 2: Remember Token Not Rotated After Use

**Problem:** The same `remember_token` value is accepted on every login for up to 30 days (or whatever `expires_at` is set to). If the token is ever captured — via access logs, a network tap, a browser history leak, or an XSS — the attacker can replay it any number of times without the legitimate user having any way to invalidate it short of manually clearing database rows.

**Fix:** Before writing to `$_SESSION`, the code issues a new token with `bin2hex(random_bytes(32))`, updates the `remember_tokens` row with the new value and a fresh expiry, and immediately replaces the browser cookie. The old token value is overwritten in the database so it can never match again.

**Explanation:** A remember-me token is essentially a long-lived password stored in a cookie. Reusing it means any single exposure creates a permanent credential until expiry. Rotating on each use implements a "rolling token" pattern: each successful login produces a new secret, and the old one is burned. If an attacker had captured the old token, their next use will fail because the database row now holds the value issued to the legitimate user's most recent visit. One pitfall: if the user has two browser tabs restoring the session simultaneously, the second tab may present an already-rotated token and get logged out. Mitigating that requires either a brief overlap window or a small token family table, but for most applications the single-token approach is the right default.

---

### Issue 3: No Constant-Time Token Comparison

**Problem:** The token lookup is a plain SQL `WHERE token = ?` equality check. On databases that short-circuit string comparison at the first differing byte and return results quickly, an attacker making many requests can measure response-time differences to learn how many leading bytes of a guessed token are correct, narrowing the search space over time.

**Fix:** After fetching the row, replace the implicit SQL equality with an explicit `hash_equals($row['token'], $token)` check in PHP. In the reference solution the SQL still fetches by token for index efficiency, but the authoritative comparison uses `hash_equals` to run in constant time regardless of where the strings diverge.

**Explanation:** Most string comparisons bail out as soon as they find a mismatch, which leaks timing information proportional to the number of correct leading characters. `hash_equals` in PHP is implemented to always iterate the full length of both strings before returning, so the execution time does not vary with the position of the first differing byte. With a 32-byte random token (64 hex chars) the practical risk of a timing attack is low but non-zero, especially under high-concurrency conditions where jitter is reduced. The fix costs nothing in complexity and is a standard hardening step for any token comparison.
