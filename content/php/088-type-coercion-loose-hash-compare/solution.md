## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Magic Hash Loose Comparison Bypass
// ------------------------------------------------------------------------

<?php
// auth/PasswordReset.php

require_once 'db.php';

$token    = $_GET['token'] ?? '';
$email    = $_GET['email'] ?? '';

// CHANGE 2: Reject empty or suspiciously short tokens before doing any DB or hash work to avoid trivial brute-force attempts.
if (strlen($token) < 32) {
    http_response_code(400);
    exit('Invalid reset link.');
}

$stmt = $pdo->prepare("SELECT token_hash FROM password_resets WHERE email = ? AND expires_at > NOW()");
$stmt->execute([$email]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    http_response_code(400);
    exit('Invalid or expired reset link.');
}

$expected = $row['token_hash'];
$provided = md5($token);

// CHANGE 1: Use hash_equals() instead of == to perform a constant-time strict string comparison, defeating magic-hash type juggling and timing attacks.
if (hash_equals($expected, $provided)) {
    // CHANGE 3: Delete the token immediately after successful verification so it cannot be replayed.
    $del = $pdo->prepare("DELETE FROM password_resets WHERE email = ? AND token_hash = ?");
    $del->execute([$email, $expected]);

    $_SESSION['reset_email'] = $email;
    header('Location: /reset/new-password.php');
    exit;
}

http_response_code(403);
exit('Token mismatch.');
```

## Explanation

### Issue 1: Loose `==` magic-hash type juggling

**Problem:** Any attacker who submits a token whose MD5 hash starts with `0e` followed only by digits will bypass verification for any stored hash that also has that form. PHP's `==` operator coerces both strings to floats when they look like scientific notation, so `0e123456` and `0e987654` both evaluate to `0.0` and compare as equal.

**Fix:** Replace `$provided == $expected` with `hash_equals($expected, $provided)`. `hash_equals()` does a byte-by-byte string comparison with no type coercion and in constant time.

**Explanation:** PHP's loose comparison (`==`) checks whether two values are *equal after type coercion*, not whether they are the same string. A string like `0e291967` is a valid PHP scientific-notation float literal meaning `0 × 10^291967`, which is `0.0`. If both sides coerce to `0.0` they satisfy `==` even though the raw strings differ. MD5 produces hex output, and roughly 1 in 256 MD5 hashes starts with `0e` followed by hex digits that happen to be all decimal — enough to make this exploitable without brute-force in practice. `hash_equals()` treats both arguments strictly as byte strings, so `"0e123" === "0e456"` is `false` as intended. As a bonus, `hash_equals()` runs in constant time regardless of where the strings first differ, which also removes a timing side-channel.

---

### Issue 2: No minimum-length validation on user-supplied token

**Problem:** The code accepts any string, including an empty string, as `$token`. An attacker can submit `token=` (empty), receive the MD5 of the empty string (`d41d8cd98f00b204e9800998ecf8427e`), and if any stored hash matches by luck or if future code changes alter the flow, the check is reached with a trivially guessable input.

**Fix:** Add a `strlen($token) < 32` guard immediately after reading the GET parameter and exit early with a 400 if the token is too short. This runs before any database query or hash computation.

**Explanation:** Password-reset tokens should be long random strings — typically 32+ hex characters. Allowing zero-length or very short inputs means an attacker pays almost nothing to probe the endpoint. The guard does not fix the `==` bug on its own, but it eliminates a class of degenerate inputs and is cheap to add. If the token generation ever changes to produce shorter strings, the threshold should be adjusted to match, but the principle of validating input shape before processing it applies regardless.

---

### Issue 3: Token not invalidated after successful use (replay vulnerability)

**Problem:** After a successful token check the code redirects to the new-password page but leaves the `password_resets` row intact. Anyone who intercepts or observes the reset URL (e.g. via browser history, a shared device, or a logged proxy) can reuse it to re-enter the password-reset flow for that account even after the legitimate user has already completed the reset.

**Fix:** Immediately after `hash_equals()` returns `true`, execute `DELETE FROM password_resets WHERE email = ? AND token_hash = ?` with `$email` and `$expected` as parameters, before setting the session variable or redirecting.

**Explanation:** One-time tokens are only one-time if they are consumed on use. The `expires_at` column limits the window, but it does not shrink to zero the moment the token is verified — it leaves the token live until it naturally expires. Deleting the row atomically after verification ensures the token cannot be reused within that window. The delete should happen before the session is written so that if the delete fails (e.g. a deadlock) the session is not granted — fail closed rather than fail open. Binding both `email` and `token_hash` in the delete is important so that a concurrent request for a different token on the same email does not accidentally delete the wrong row.
