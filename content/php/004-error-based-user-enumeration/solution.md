## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Password reset endpoint reveals whether an email address is registered through distinct error messages
// ------------------------------------------------------------------------
<?php
// auth/reset_request.php

header('Content-Type: application/json');

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', getenv('DB_PASSWORD'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);

if (!$email) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

// CHANGE 3: Enforce a per-IP rate limit before touching the database or sending mail, so bulk enumeration and mail-flood attacks are blocked early.
$rateLimitKey = 'pw_reset_' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
$cacheFile = sys_get_temp_dir() . '/' . $rateLimitKey;
$windowSeconds = 300;
$maxAttempts  = 5;
$now = time();
$attempts = [];
if (file_exists($cacheFile)) {
    $attempts = array_filter(
        json_decode(file_get_contents($cacheFile), true) ?? [],
        fn($t) => ($now - $t) < $windowSeconds
    );
}
if (count($attempts) >= $maxAttempts) {
    http_response_code(429);
    echo json_encode(['message' => 'If that address is registered, a reset link has been sent']);
    exit;
}
$attempts[] = $now;
file_put_contents($cacheFile, json_encode(array_values($attempts)), LOCK_EX);

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

// CHANGE 1: Always respond with HTTP 200 and the same generic message regardless of whether the email exists, so an attacker cannot distinguish a registered address from an unregistered one by comparing responses.
if (!$user) {
    http_response_code(200);
    echo json_encode(['message' => 'If that address is registered, a reset link has been sent']);
    exit;
}

$token  = bin2hex(random_bytes(32));
$expiry = date('Y-m-d H:i:s', strtotime('+1 hour'));

// CHANGE 2: Use password_hash() (bcrypt by default) instead of a bare sha256 hex digest, so a dump of the resets table cannot be trivially reversed with a rainbow table or fast GPU attack.
$pdo->prepare(
    'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)'
)->execute([$user['id'], password_hash($token, PASSWORD_BCRYPT), $expiry]);

// Assume send_mail() is defined elsewhere.
send_mail($email, 'Password Reset', "Use this link: https://app.example.com/reset?token={$token}");

// CHANGE 1 (continued): Return the identical message used when no user was
// found, so response bodies are indistinguishable to an outside observer.
echo json_encode(['message' => 'If that address is registered, a reset link has been sent']);
```

## Explanation

### Issue 1: User enumeration via distinct error response

**Problem:** When the submitted email is not in the database the endpoint returns HTTP 404 with the body `"No account with that email address"`. When it is registered, the endpoint returns HTTP 200 with `"Reset link sent"`. An attacker can submit thousands of addresses in a loop and record which ones get 200 vs 404 to build a list of valid accounts.

**Fix:** The `http_response_code(404)` call and the `'No account with that email address'` message are replaced with `http_response_code(200)` and the generic string `'If that address is registered, a reset link has been sent'`. The same string is also used in the success path at the bottom of the file, so both branches are byte-for-byte identical to the caller.

**Explanation:** The enumeration works because the two code paths produce observably different outputs — status code and body text both differ. Normalising both to 200 and an identical body removes all signal an attacker could use. The one subtlety is response timing: if the registered path is measurably slower (database write, mail send), a timing side-channel survives. For a more complete fix you would add a constant-time sleep or defer the mail send to a background queue, but eliminating the status-code and body difference already closes the flagged vulnerability. The validation 400 path is intentionally kept distinct because it fires before any lookup and reveals nothing about account existence.

---

### Issue 2: Reset token stored as fast, unsalted SHA-256 hash

**Problem:** The code stores `hash('sha256', $token)` in the `password_resets` table. SHA-256 is a fast, deterministic function with no salt. If the table is exfiltrated, an attacker can reverse the stored digests with a precomputed table of 64-hex-character strings or a GPU brute-force in minutes, because the input space is a 64-character hex string drawn from `bin2hex(random_bytes(32))`.

**Fix:** `hash('sha256', $token)` is replaced with `password_hash($token, PASSWORD_BCRYPT)`. On the verification side (not shown here but required) `password_verify($submittedToken, $storedHash)` replaces a direct string comparison.

**Explanation:** `password_hash()` applies bcrypt, which is intentionally slow (work factor ~10 by default) and embeds a random salt in the output string. Even if the resets table is dumped, each row requires a full bcrypt computation to test a candidate, making bulk reversal impractical. `hash('sha256', ...)` provides no such resistance — a modern GPU can compute billions of SHA-256 operations per second. One related pitfall: the verification endpoint must use `password_verify()` rather than re-hashing and comparing, because bcrypt hashes are not deterministic across calls.

---

### Issue 3: No rate limiting allows bulk probing and mail flooding

**Problem:** The endpoint accepts unlimited requests from any IP. An attacker can submit millions of email addresses in a short time to enumerate accounts (even after fixing issue 1, they could use timing differences or just exhaust send quotas) and can also trigger mass outgoing mail by repeatedly submitting known valid addresses.

**Fix:** A sliding-window counter keyed on `REMOTE_ADDR` is added before the database query. It uses a temporary file per IP and caps requests at 5 per 5-minute window, returning HTTP 429 with the same generic message on overflow.

**Explanation:** Without a gate, the only cost to an attacker is network bandwidth. Even a uniform response body (issue 1 fix) can still leak information through timing if the attacker sends enough requests and averages the latency. Rate limiting raises the cost of enumeration to the point where it becomes operationally impractical. The file-based counter used here is illustrative; a production system would use Redis or a database-backed counter to avoid race conditions under concurrent load and to share state across multiple web workers. The 429 response intentionally reuses the same generic message so the rate-limit branch itself does not reveal whether the address was registered.
