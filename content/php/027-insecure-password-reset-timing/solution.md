## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Timing Oracle in Password Reset
// ------------------------------------------------------------------------

<?php
// auth/reset-password.php

header('Content-Type: application/json');

$conn = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$email = strtolower(trim($_POST['email'] ?? ''));
$token = trim($_POST['token'] ?? '');

// Look up user by email first
$stmt = $conn->prepare(
    'SELECT id, reset_token, reset_expires FROM users WHERE email = ?'
);
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

// CHANGE 1: Always run hash_equals even when the user is not found, using a dummy hash, so that both the "no such email" and "bad token" paths take the same amount of time and cannot be distinguished by timing.
$storedToken = $user ? ($user['reset_token'] ?? '') : '';
hash_equals($storedToken, $token);

if (!$user) {
    echo json_encode(['valid' => false]);
    exit;
}

// Email exists — now validate the token
if (
    $user['reset_token'] === null ||
    !hash_equals($user['reset_token'], $token) ||
    // CHANGE 2: Use the correct column name `reset_expires` (was `reset_token_expires`) so expiry is actually enforced.
    strtotime($user['reset_expires']) < time()
) {
    echo json_encode(['valid' => false]);
    exit;
}

echo json_encode(['valid' => true]);
```

## Explanation

### Issue 1: Early Exit Leaks Email-Existence Timing

**Problem:** When an email address is not in the database, the code hits the `if (!$user)` block and returns a JSON response immediately — skipping `hash_equals` entirely. Requests for registered-but-invalid-token emails must run `hash_equals`, which takes measurably longer. An attacker sending thousands of requests can distinguish the two cases by average response time (~40 ms difference) and enumerate registered accounts.

**Fix:** Before the early-exit check, unconditionally call `hash_equals($storedToken, $token)` where `$storedToken` is either the real token or an empty string when the user does not exist. This dummy call is added at `CHANGE 1` so both code paths spend approximately equal time in the slow comparison.

**Explanation:** `hash_equals` is designed to run in constant time relative to the length of the strings, but it still consumes real CPU cycles. The timing oracle exists not because `hash_equals` is broken, but because the unknown-user branch never calls it at all. By always executing `hash_equals` before branching on whether `$user` is set, both paths do the same amount of work. The result of the dummy call is intentionally discarded; its only purpose is equalising wall-clock time. A related pitfall: if you add any other expensive operation (e.g., a second DB query) only in the found-user branch, you reintroduce the oracle, so every branch must mirror the same heavyweight operations.

---

### Issue 2: Wrong Column Name Skips Expiry Check

**Problem:** The SELECT retrieves the column `reset_expires`, but the expiry check reads `$user['reset_token_expires']`. In PHP, accessing a non-existent array key returns `null`, so `strtotime(null)` returns `false`, and `false < time()` is always `true`. Every token validation therefore fails with "expired" regardless of the actual expiry time stored in the database — no token ever works.

**Fix:** At `CHANGE 2`, replace `$user['reset_token_expires']` with `$user['reset_expires']` to match the column name actually fetched by the SELECT statement.

**Explanation:** The SELECT lists `reset_expires` by name, but the PHP code references `reset_token_expires` — two different strings. PHP does not throw an error for a missing array key by default (it emits a notice in PHP 8, a warning in earlier versions), so the bug is silent in production unless notices are logged. `strtotime(null)` (or `strtotime('')`) returns `false`, which is cast to `0` in the integer comparison, and since `0 < time()` is always true the condition treats every token as expired. Fixing the key name to `reset_expires` means `strtotime` receives an actual datetime string and the comparison works correctly. To catch this class of bug earlier, enabling `PDO::FETCH_ASSOC` strict-mode error reporting and turning on PHP notices in development pays off.
