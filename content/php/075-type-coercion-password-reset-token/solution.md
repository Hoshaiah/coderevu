## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose Comparison Bypasses Token Check
// ------------------------------------------------------------------------

<?php
// password_reset.php

require __DIR__ . '/db.php'; // provides $pdo

$token   = $_GET['token'] ?? '';
$user_id = (int) ($_GET['uid'] ?? 0);

// CHANGE 2: Reject blank or suspiciously short tokens before hitting the DB, preventing empty-string matches and reducing pointless queries.
if (strlen($token) < 32) {
    http_response_code(400);
    exit('Invalid or expired reset link.');
}

$stmt = $pdo->prepare(
    "SELECT token FROM password_resets WHERE user_id = ? AND expires_at > NOW()"
);
$stmt->execute([$user_id]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    http_response_code(400);
    exit('Invalid or expired reset link.');
}

// CHANGE 1: Replaced `==` with `hash_equals()` which uses strict string comparison and constant-time evaluation, eliminating PHP type-juggling bypass and timing side-channels.
if (hash_equals($row['token'], $token)) {
    // Token accepted — let user set a new password
    $_SESSION['reset_uid'] = $user_id;
    header('Location: /new_password.php');
    exit;
}

http_response_code(400);
echo 'Invalid token.';
```

## Explanation

### Issue 1: Loose equality enables token bypass

**Problem:** Any request with `?token=0` is accepted for reset rows whose stored token starts with a letter (a–f in hex). The attacker can reset any account they know the `uid` for, without ever receiving an email.

**Fix:** Replace `$row['token'] == $token` with `hash_equals($row['token'], $token)` at the CHANGE 1 site. `hash_equals` compares two strings byte-by-byte with no type coercion and in constant time.

**Explanation:** PHP's `==` operator applies type juggling before comparing. When one operand looks numeric, PHP converts both sides to numbers. `bin2hex(random_bytes(16))` produces 32 hex characters; if the first character is a letter (a–f), PHP coerces the whole string to integer `0`. The URL-supplied `0` is also integer `0`, so `0 == 0` is `true`. Because hex output is entirely `[0-9a-f]`, any token whose first character is a letter is vulnerable — roughly 6/16 ≈ 37.5 % of all generated tokens. `hash_equals` treats both arguments as raw strings, so `'0' === 'a3c...'` is `false` regardless of content. As a bonus, its constant-time evaluation prevents timing attacks that could leak token prefixes.

---

### Issue 2: Empty token input accepted without validation

**Problem:** A request with `?token=` supplies an empty string. If somehow an empty token exists in the database (e.g., a migration error), `'' == ''` is `true` and the check passes. Even with `hash_equals`, sending an empty token wastes a DB round-trip and may expose reset-row existence via response timing.

**Fix:** Add a `strlen($token) < 32` guard at the CHANGE 2 site, returning 400 immediately for any token shorter than the expected 32-character hex string, before the database is queried.

**Explanation:** `bin2hex(random_bytes(16))` always produces exactly 32 characters. Any input shorter than that is definitively invalid and can be rejected without touching the database. This eliminates the empty-string edge case, reduces DB load from malformed requests, and keeps the error path indistinguishable from the "no row found" path — the same 400 message is returned — so an attacker cannot infer whether a `uid` has a pending reset by probing with short tokens.
