## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Bcrypt Silently Truncates Long Passwords
// ------------------------------------------------------------------------

<?php
// auth/register.php

require __DIR__ . '/../db.php'; // provides $pdo

// CHANGE 2: Validate email before doing any expensive work so we fail fast on bad input.
$email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);
if (!$email) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid email']);
    exit;
}

$password = $_POST['password'] ?? '';

if (strlen($password) < 8) {
    http_response_code(422);
    echo json_encode(['error' => 'Password too short']);
    exit;
}

// CHANGE 3: Reject passwords longer than 1000 characters to prevent DoS via large input to hash functions.
if (strlen($password) > 1000) {
    http_response_code(422);
    echo json_encode(['error' => 'Password too long']);
    exit;
}

// CHANGE 1: Pre-hash the password with SHA-384 (base64-encoded, 64 chars) before passing to bcrypt so that passwords differing only beyond byte 72 produce distinct bcrypt inputs, defeating bcrypt's 72-byte truncation limit without losing entropy.
$prehashed = base64_encode(hash('sha384', $password, true));
$hash = password_hash($prehashed, PASSWORD_BCRYPT);

$stmt = $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');  
$stmt->execute([$email, $hash]);

http_response_code(201);
echo json_encode(['ok' => true]);
```

## Explanation

### Issue 1: Bcrypt 72-byte Silent Truncation

**Problem:** Bcrypt only processes the first 72 bytes of its input and ignores everything after that. Two users whose passwords share the same first 72 bytes can each log in with the other's password, because `password_verify()` sees identical bcrypt inputs. This is not a PHP bug — it is the bcrypt specification, and `password_hash` does not hide it.

**Fix:** Before calling `password_hash`, compute `base64_encode(hash('sha384', $password, true))` and pass the result (always 64 ASCII characters, well under 72 bytes) to `password_hash` instead of the raw password. The companion `login.php` must apply the same pre-hash before calling `password_verify`.

**Explanation:** SHA-384 produces a 48-byte binary digest, which base64-encodes to exactly 64 characters. Any change anywhere in the original password — even at byte 73 — causes a completely different SHA-384 output, so the two bcrypt inputs are distinct. The output always fits inside bcrypt's 72-byte window, so no truncation occurs. Using the `true` (raw binary) flag before base64 keeps full 384-bit entropy; using the hex string would also work but wastes bytes. When updating `login.php`, apply the same `base64_encode(hash('sha384', $password, true))` step before `password_verify()`; otherwise existing users cannot log in.

---

### Issue 2: Validation Runs After Expensive Work

**Problem:** The original code hashes the password with bcrypt before it validates the email address. If the email is invalid, the response is a 422 error regardless — but the server already spent time running bcrypt (which is intentionally slow). In a tight loop, an attacker can trigger repeated bcrypt computations at no extra cost by submitting garbage email addresses.

**Fix:** Move the `filter_var` email validation block to the top of the file, before the `strlen` check and before `password_hash` is called, so any invalid request is rejected immediately without touching the hash function.

**Explanation:** Bcrypt is designed to be slow (cost factor controls this). Any code path that reaches `password_hash` on every request — valid or not — gives an attacker a cheap way to burn CPU. Validating cheap, fast conditions (email format) first means the expensive operation only runs when the request is already known to be structurally valid. This is a general principle: order guards from cheapest to most expensive.

---

### Issue 3: No Maximum Password Length (DoS via Large Input)

**Problem:** The form enforces a minimum of 8 characters but no maximum. An attacker can POST a multi-megabyte password string. PHP will read it into memory and pass it to `hash('sha384', ...)` (after the Issue 1 fix) or directly to bcrypt (in the original). Processing a very large string is slow and memory-intensive, and bcrypt's intentional slowness compounds the problem.

**Fix:** Add a `strlen($password) > 1000` check that returns a 422 response immediately, before any hashing takes place. The threshold of 1000 is generous for real passwords while blocking abusive inputs.

**Explanation:** Without a maximum length, each request body is only limited by PHP's `post_max_size` (default 8 MB). Even with the SHA-384 pre-hash, hashing 8 MB per request still takes non-trivial time and allocates memory for the full string. Capping at 1000 characters — far above any legitimate passphrase — eliminates this exposure. A related pitfall: setting the limit too low (e.g., 72) would prevent users from entering long passwords, undermining security; 1000 keeps strong passphrases usable.
