## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Session ID Preserved Across Login
// ------------------------------------------------------------------------

<?php
// src/Auth/LoginController.php

require_once __DIR__ . '/../../bootstrap.php';

session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: /login');
    exit;
}

$email    = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

$pdo  = get_db_connection();
$stmt = $pdo->prepare("SELECT id, password_hash FROM users WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password_hash'])) {
    $_SESSION['login_error'] = 'Invalid email or password.';
    header('Location: /login');
    exit;
}

// Merge anonymous cart into user's saved cart
$anon_cart = $_SESSION['cart'] ?? [];
merge_cart($pdo, $user['id'], $anon_cart);

// CHANGE 1: Regenerate the session ID at the authentication boundary to prevent session fixation; the true argument deletes the old session file on disk so no data leaks under the old ID (CHANGE 2).
session_regenerate_id(true);

$_SESSION['user_id'] = $user['id'];
$_SESSION['cart']    = [];

header('Location: /account/dashboard');
exit;
```

## Explanation

### Issue 1: Session fixation after login

**Problem:** After a successful login, the code writes the authenticated user's ID into the existing session without issuing a new session ID. An attacker who knows a valid session ID (obtained by visiting the site themselves, or injecting it via a subdomain cookie gadget) can present that ID to the server; once the victim logs in with it, the attacker's browser — carrying the same ID — immediately has access to the victim's account.

**Fix:** Call `session_regenerate_id(true)` immediately after credential verification passes and before writing `$_SESSION['user_id']`. This is the single line added between `merge_cart(...)` and the session writes.

**Explanation:** PHP's `session_start()` resumes whatever session ID the client sends. The server never questions whether the ID was issued to this particular client. So if an attacker plants a known ID in the victim's browser, `session_start()` happily loads the attacker's session for the victim to populate. Calling `session_regenerate_id()` tells PHP to mint a brand-new ID and associate all current session data with it, then send a `Set-Cookie` header so the legitimate browser gets the new ID. The attacker's browser still holds the old ID, which now maps to nothing (or to a deleted file when `true` is passed). Every framework that manages authentication calls the equivalent of this function at login for exactly this reason.

---

### Issue 2: Old session file retained after ID regeneration

**Problem:** Calling `session_regenerate_id()` with no argument (or `false`) creates a new session file and updates the cookie, but leaves the old session file intact on the server. Under some race conditions or if the attacker polls quickly, the old session ID may still resolve to valid session data for a short window.

**Fix:** Pass `true` to `session_regenerate_id()` — written as `session_regenerate_id(true)` — so PHP immediately unlinks the old session file as part of the same operation.

**Explanation:** PHP's session storage keeps one file (or one cache entry) per session ID. Without the `true` flag, the old file stays on disk until the garbage collector runs (driven by `session.gc_probability` and `session.gc_divisor`, which are often set low). An attacker who can observe timing could still send a request on the old ID before GC removes it. Passing `true` removes the old file synchronously during `session_regenerate_id`, closing that window entirely. One pitfall: on high-traffic sites with file-based sessions, the delete is a filesystem operation — this is fine for the security boundary at login, which happens infrequently per user.
