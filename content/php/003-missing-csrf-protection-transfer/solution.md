## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Bank transfer form has no CSRF token, allowing any website to trigger transfers on behalf of logged-in users
// ------------------------------------------------------------------------
<?php
// transfers/submit.php

session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(403);
    exit;
}

// CHANGE 1: Generate a per-session CSRF token if one does not already exist. The form must embed this token; we reject any request that omits or mismatches it.
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// CHANGE 1: Validate the submitted CSRF token against the session token. Use hash_equals to prevent timing-based side-channel comparison attacks.
if (
    empty($_POST['csrf_token']) ||
    !hash_equals($_SESSION['csrf_token'], $_POST['csrf_token'])
) {
    http_response_code(403);
    echo 'Invalid or missing CSRF token';
    exit;
}

$pdo = new PDO('mysql:host=db;dbname=bank', 'app', getenv('DB_PASSWORD'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$fromAccount = (int) $_POST['from_account'];
$toAccount   = (int) $_POST['to_account'];
$amount      = (int) round((float) $_POST['amount'] * 100); // store as cents
$userId      = (int) $_SESSION['user_id'];

if ($amount <= 0) {
    http_response_code(400);
    echo 'Invalid amount';
    exit;
}

// Verify the from-account belongs to this user.
$stmt = $pdo->prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?');
$stmt->execute([$fromAccount, $userId]);
if (!$stmt->fetch()) {
    http_response_code(403);
    echo 'Account not yours';
    exit;
}

// CHANGE 3: Verify that the destination account actually exists before inserting the transfer, preventing transfers to arbitrary or non-existent account IDs.
$stmtTo = $pdo->prepare('SELECT id FROM accounts WHERE id = ?');
$stmtTo->execute([$toAccount]);
if (!$stmtTo->fetch()) {
    http_response_code(400);
    echo 'Destination account not found';
    exit;
}

$pdo->prepare(
    'INSERT INTO transfers (from_account, to_account, amount_cents, created_at)
     VALUES (?, ?, ?, NOW())'
)->execute([$fromAccount, $toAccount, $amount]);

header('Location: /transfers?success=1');
exit;
```

## Explanation

### Issue 1: No CSRF token validation on transfer endpoint

**Problem:** A logged-in user who visits a malicious third-party page can have a transfer triggered without their knowledge. The attacker embeds a hidden form pointing at `/transfers/submit.php` and auto-submits it with JavaScript. The browser attaches the victim's session cookie automatically, so the server treats the forged request as legitimate.

**Fix:** Two `CHANGE 1` sites are added. First, a cryptographically random token is generated with `bin2hex(random_bytes(32))` and stored in `$_SESSION['csrf_token']` when the session starts (if one does not already exist). Second, immediately after session validation the handler reads `$_POST['csrf_token']` and compares it to the session value using `hash_equals`; any mismatch results in a 403 and early exit.

**Explanation:** CSRF works because browsers automatically include cookies with cross-origin POST requests. The server cannot distinguish a form submitted by the legitimate site from one submitted by an attacker's site — unless the request contains a secret that only the legitimate site could have embedded. Storing a random token in the session and requiring it in every state-changing POST breaks this: the attacker's page cannot read the token (same-origin policy prevents cross-origin reads of the response that would contain the token in the form). `hash_equals` is used instead of `===` because a plain string comparison short-circuits on the first differing byte, giving timing information that could theoretically be exploited to guess tokens character by character. Rotating the token after a successful transfer is an optional further hardening step if per-request tokens are desired.

---

### Issue 2: CSRF token never generated or surfaced to the form

**Problem:** Even after adding validation in the submit handler, the transfer form itself has no `<input type="hidden" name="csrf_token">` field. Without generating and embedding the token in the form, every legitimate submission would also be rejected with 403.

**Fix:** The `CHANGE 1` site that calls `bin2hex(random_bytes(32))` and stores the result in `$_SESSION['csrf_token']` is the generation half of the fix. The form template (not shown in this file but part of the same change) must echo `$_SESSION['csrf_token']` into a hidden input so the browser sends it back on submission.

**Explanation:** The token only provides protection when it travels from server to client inside the rendered HTML (over a same-origin response) and back in the POST body. If the session initialisation code does not produce the token, there is nothing to embed in the form and nothing to validate. `random_bytes(32)` provides 256 bits of entropy from the OS CSPRNG, which is far more than needed to make brute-forcing impractical. Storing the token in the session rather than a cookie is essential — a cookie value is automatically sent cross-origin just like the session cookie, so it would not provide any protection.

---

### Issue 3: Destination account is never verified to exist

**Problem:** The handler checks that `from_account` belongs to the authenticated user but performs no check on `to_account`. A client can submit any integer as the destination, including IDs that do not correspond to any real account. Depending on the database schema and application logic, this can corrupt ledger integrity or transfer funds into a phantom account that can never be reconciled.

**Fix:** A `CHANGE 3` site adds a `SELECT id FROM accounts WHERE id = ?` query against `$toAccount`. If no row is returned, the handler responds with 400 and exits before the `INSERT` runs.

**Explanation:** The original code implicitly trusted that a well-formed integer destination was valid. A foreign-key constraint on the `transfers` table would catch this at the database level, but relying solely on the database for input validation makes error messages harder to control and pushes the rejection further down the stack. Validating at the application layer lets the handler return a clear 400 with a meaningful message before touching the database unnecessarily. A related pitfall: if the business logic should prevent a user from transferring to their own account, an additional check comparing `$fromAccount !== $toAccount` belongs in the same block.
