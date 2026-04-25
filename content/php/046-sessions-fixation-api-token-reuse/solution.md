## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — API Token Never Rotated on Login
// ------------------------------------------------------------------------

<?php
// api/login.php

header('Content-Type: application/json');

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$body = json_decode(file_get_contents('php://input'), true);
$email    = $body['email']    ?? '';
$password = $body['password'] ?? '';

// CHANGE 2: removed the stray comma between `password_hash,` and `FROM` that caused a SQL syntax error on every request.
$stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
    exit;
}

// CHANGE 1: generate a fresh cryptographically-random token on every successful login so old tokens are immediately invalidated.
$newToken = bin2hex(random_bytes(32));

// CHANGE 1: upsert the new token, replacing whatever value was stored before, instead of only reading the existing one.
$stmt = $pdo->prepare(
    'INSERT INTO api_tokens (user_id, token) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE token = VALUES(token)'
);
$stmt->execute([$user['id'], $newToken]);

// CHANGE 3: verify the upsert actually affected a row before returning a token, and respond with 500 if something went wrong.
if ($stmt->rowCount() === 0) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not issue token']);
    exit;
}

echo json_encode(['token' => $newToken]);
```

## Explanation

### Issue 1: Token Never Rotated on Login

**Problem:** Every successful login returns the token that was generated at registration time. If an attacker captures that token from a log file, a phishing page, or a compromised device, they can use it forever because the legitimate user's subsequent logins never invalidate it.

**Fix:** Replace the `SELECT token FROM api_tokens` read with a write: generate a new token using `bin2hex(random_bytes(32))` and persist it with an `INSERT … ON DUPLICATE KEY UPDATE token = VALUES(token)` upsert, then return `$newToken` directly rather than re-reading from the database.

**Explanation:** The old code treated the token as an immutable identifier set once at registration. Token rotation turns each login into a "start of a new session" event: the moment the legitimate user authenticates, the previously issued token is overwritten and any holder of the old value is locked out. `random_bytes(32)` draws 256 bits of OS-level entropy, which makes each rotated token independently unguessable. A related pitfall: if rotation happens in a separate `UPDATE` call that races with a concurrent login, two requests could briefly see different tokens — the upsert collapses that into a single atomic operation.

---

### Issue 2: Stray Comma in SQL Causes Syntax Error

**Problem:** The query `'SELECT id, password_hash, FROM users WHERE email = ?'` contains a trailing comma before `FROM`, which is invalid SQL. MySQL rejects it immediately, `PDO` throws a `PDOException`, and no user can log in at all — the endpoint is entirely broken.

**Fix:** Remove the comma so the query reads `'SELECT id, password_hash FROM users WHERE email = ?'` — one character deleted from the string literal on that `prepare()` call.

**Explanation:** PHP's `PDO::prepare()` sends the SQL string to MySQL for parsing before any data is bound. MySQL's parser sees a column-list that ends with a comma and then finds the keyword `FROM` where it expects another column name, so it returns a syntax error. Because `ERRMODE_EXCEPTION` is set, PDO converts that into a thrown exception that the script does not catch, producing an unhandled-exception response (typically a 500 with an HTML error page) rather than JSON. The fix is purely cosmetic — no logic changes — but without it none of the authentication logic ever runs.

---

### Issue 3: Missing Row-Existence Check After Token Operation

**Problem:** The original code calls `$stmt->fetch()` on the token query and immediately reads `$row['token']` without checking whether a row was found. If the `api_tokens` table has no entry for this user (e.g., the registration flow failed silently), the response is `{"token":null}` with HTTP 200, which the mobile client may treat as a valid login.

**Fix:** After the upsert, check `$stmt->rowCount() === 0` and respond with HTTP 500 and an error body if no rows were affected, then `exit`. The happy path reaches `echo json_encode(['token' => $newToken])` only when the write is confirmed.

**Explanation:** `PDOStatement::rowCount()` returns the number of rows inserted or updated by the last DML statement. An upsert that inserts returns 1; one that updates returns 2 in MySQL's implementation; a value of 0 means neither happened, which signals an unexpected database state. Returning a `null` token as HTTP 200 is dangerous because the client might store it and send `Authorization: Bearer ` (empty) on subsequent requests, which could accidentally match permissive server-side checks. Responding with 500 forces the client to surface the error rather than silently proceeding with a broken session.
