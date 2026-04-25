## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — No Session Regeneration on Sudo
// ------------------------------------------------------------------------

<?php
// admin/sudo.php

session_start();

if (empty($_SESSION['user_id'])) {
    header('Location: /login.php');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // CHANGE 3: Validate CSRF token before doing any credential check to block forged cross-site sudo requests.
    if (empty($_SESSION['sudo_csrf_token']) || !hash_equals($_SESSION['sudo_csrf_token'], $_POST['csrf_token'] ?? '')) {
        $error = 'Invalid request. Please try again.';
        include 'views/sudo_form.php';
        exit;
    }

    $password = $_POST['password'] ?? '';

    $pdo  = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']));)
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row && password_verify($password, $row['password_hash'])) {
        // CHANGE 1: Regenerate the session ID here — before writing any elevated flags — so a pre-planted session ID is discarded and the attacker's copy of the session never receives sudo_mode.
        session_regenerate_id(true);
        // CHANGE 2: Only after regeneration do we write the elevated flags, ensuring they exist solely in the new session that only the legitimate browser holds.
        $_SESSION['sudo_mode']    = true;
        $_SESSION['sudo_expires'] = time() + 300;
        // CHANGE 3: Discard the CSRF token after a successful sudo so it cannot be replayed.
        unset($_SESSION['sudo_csrf_token']);
        header('Location: /admin/dashboard.php');
        exit;
    }

    $error = 'Incorrect password.';
}

// CHANGE 3: Generate a fresh per-request CSRF token that the sudo form will embed as a hidden field.
if (empty($_SESSION['sudo_csrf_token'])) {
    $_SESSION['sudo_csrf_token'] = bin2hex(random_bytes(32));
}

include 'views/sudo_form.php';
```

## Explanation

### Issue 1: Missing session_regenerate_id() on privilege elevation

**Problem:** After a successful password check, the code writes `sudo_mode = true` into the existing session without changing the session ID. An attacker who planted a known session ID in the victim's browser (session fixation) retains that same ID and immediately gains `sudo_mode` in their own browser tab.

**Fix:** `session_regenerate_id(true)` is called immediately after the password check succeeds and before any elevated flags are written. The `true` argument deletes the old session file on the server so the attacker's copy is invalidated.

**Explanation:** PHP sessions are identified by a cookie containing the session ID. If an attacker can set that cookie in the victim's browser before the victim authenticates (via a subdomain cookie, XSS, or network interception), both parties share the same session store entry. When the victim later proves their identity and the server writes `sudo_mode = true`, the attacker's browser — still sending the same ID — reads the upgraded session. Calling `session_regenerate_id(true)` swaps the server-side store to a new random key and removes the old one, so the attacker's stale ID maps to nothing. This must happen before writing the elevated flags; writing them first and regenerating second creates a brief window where the old ID already carries `sudo_mode`.

---

### Issue 2: Elevated flags written before old session is invalidated

**Problem:** In the original code `$_SESSION['sudo_mode'] = true` runs while the session ID is still the attacker-controlled one. Even if `session_regenerate_id` were called afterward, there is a small race window where the elevated session data exists under the old ID.

**Fix:** In the reference solution, `session_regenerate_id(true)` appears on the line immediately before `$_SESSION['sudo_mode'] = true` and `$_SESSION['sudo_expires'] = time() + 300`, guaranteeing the elevated flags are written only into the new session.

**Explanation:** PHP's `session_regenerate_id(true)` both creates a new session file and deletes the old one atomically from the server's perspective. After that call returns, any subsequent writes to `$_SESSION` go into the new file keyed by the new ID. The browser automatically receives the new ID in a `Set-Cookie` response header at the end of the request. Putting the regeneration call after the flag writes — even by one line — means the flags briefly exist in the old session before deletion, which is an unnecessary risk and defeats the purpose of regeneration in a fixation scenario.

---

### Issue 3: No CSRF protection on the sudo POST endpoint

**Problem:** The sudo form accepts any POST request that contains a correct password. If the attacker knows or can guess the password (or uses a phishing page that makes the victim type it into a controlled form), the POST can be submitted cross-origin without any token check, silently elevating the session.

**Fix:** A `sudo_csrf_token` is generated with `bin2hex(random_bytes(32))` and stored in `$_SESSION` before the form is rendered. On POST, `hash_equals` compares it against `$_POST['csrf_token']`; a mismatch aborts with an error. The token is `unset` after a successful sudo to prevent replay.

**Explanation:** CSRF lets an attacker cause a victim's authenticated browser to send a state-changing request to your server. For most forms the attacker cannot read the response, but for the sudo flow they do not need to — the goal is just to set `sudo_mode = true`. A per-session, single-use random token tied to the form ensures that only a page served by your own application can submit a valid sudo request. `hash_equals` is used instead of `===` to avoid timing side-channels that could leak the token one bit at a time. The token is discarded after success so a captured token from one sudo flow cannot elevate a future session.
