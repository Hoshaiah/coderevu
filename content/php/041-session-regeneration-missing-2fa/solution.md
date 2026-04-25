## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Missing Session Regeneration After 2FA
// ------------------------------------------------------------------------

<?php
// auth/verify-totp.php

session_start();

if (empty($_SESSION['pending_2fa_user_id'])) {
    header('Location: /auth/login.php');
    exit;
}

require_once __DIR__ . '/../lib/totp.php';

$userId = (int) $_SESSION['pending_2fa_user_id'];
$code   = trim($_POST['code'] ?? '');

$conn = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$stmt = $conn->prepare('SELECT totp_secret FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !totp_verify($user['totp_secret'], $code)) {
    $_SESSION['totp_error'] = 'Invalid code';
    header('Location: /auth/verify-totp.php');
    exit;
}

unset($_SESSION['pending_2fa_user_id']);
$_SESSION['user_id']       = $userId;
$_SESSION['authenticated'] = true;

// CHANGE 1: Regenerate session ID at the final privilege-elevation point (2FA completion) and delete the old session file to prevent session fixation — an attacker who planted the pre-login session ID would otherwise inherit full authentication here.
session_regenerate_id(true);

header('Location: /dashboard.php');
exit;
```

## Explanation

### Issue 1: Missing session regeneration at 2FA completion

**Problem:** After a successful TOTP check the code immediately writes `user_id` and `authenticated = true` into the session without issuing a new session ID. An attacker who planted a session cookie on the victim's browser before login (via a subdomain cookie, network interception, or XSS) now holds a fully authenticated session without ever knowing the password or TOTP code.

**Fix:** `session_regenerate_id(true)` is called after writing the authenticated session data and before the redirect to `/dashboard.php`. The `true` argument tells PHP to delete the old session file on disk immediately.

**Explanation:** PHP file-based sessions map a cookie value to a file under the session save path. If an attacker forces the victim's browser to use session ID `X`, PHP happily writes to `sess_X` as the victim progresses through login and TOTP. Without regeneration, `sess_X` ends up containing `authenticated = true`, and the attacker's browser (also holding cookie `X`) immediately has access. Calling `session_regenerate_id(true)` copies the current `$_SESSION` data into a new file under a fresh ID and removes `sess_X`, so the attacker's cookie becomes invalid. The regeneration must happen at every privilege-elevation point — the password step alone is not enough, because the session is still in a `pending_2fa` half-authenticated state at that point and is elevated a second time here.

---

### Issue 2: Old session file not deleted on regeneration

**Problem:** Without passing `true` to `session_regenerate_id()`, the old session file is kept on disk. During the brief window between regeneration and the next request, two session files both describe the same authenticated user — one under the old ID, one under the new. If the old ID is still in the attacker's possession (session fixation scenario), they can make a request against it before PHP's garbage collector removes it.

**Fix:** `session_regenerate_id(true)` — the boolean argument — causes PHP to call `session_destroy()` on the old session file as part of the same operation, closing the window immediately.

**Explanation:** PHP's default behavior when `delete_old_session` is `false` is to leave the old file so that in-flight requests using the old ID do not get a blank session. For a normal session rotation this is a convenience, but at a security boundary it means both the old and new IDs are live simultaneously. With `true`, the old file is unlinked in the same call that creates the new one, so there is no overlap. A related pitfall: some shared-hosting environments set `session.gc_maxlifetime` very high, meaning the old file could survive for hours if not explicitly deleted.
