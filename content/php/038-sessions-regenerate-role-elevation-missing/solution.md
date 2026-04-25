## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — No Session Regeneration on Role Change
// ------------------------------------------------------------------------

<?php
// admin/impersonate.php

session_start();

if (($_SESSION['role'] ?? '') !== 'superadmin') {
    http_response_code(403);
    exit('Forbidden');
}

$targetUserId = (int) $_POST['user_id'];

$db = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$stmt = $db->prepare('SELECT id, email, role FROM users WHERE id = ?');
$stmt->execute([$targetUserId]);
$targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$targetUser) {
    http_response_code(404);
    exit('User not found');
}

// Store original admin identity so we can restore it later
$_SESSION['_original_admin_id']   = $_SESSION['user_id'];
$_SESSION['_original_admin_role'] = $_SESSION['role'];

$_SESSION['user_id'] = $targetUser['id'];
$_SESSION['role']    = $targetUser['role'];
$_SESSION['email']   = $targetUser['email'];

// CHANGE 1: Regenerate the session ID after all privilege data is written, deleting the old session file; this invalidates any planted or previously known session ID so an attacker cannot hijack the resulting customer session.
session_regenerate_id(true);

// CHANGE 3: Rotate the CSRF token so any token the attacker observed under the old session ID cannot be reused against the new customer-level session.
$_SESSION['csrf_token'] = bin2hex(random_bytes(32));

header('Location: /dashboard.php');
exit;
```

## Explanation

### Issue 1: No Session ID Regeneration on Role Change

**Problem:** After the code swaps `$_SESSION['role']` and `$_SESSION['user_id']` to the target customer's values, the browser and server still share the exact same session ID that existed when the agent was authenticated as superadmin. Any attacker who knew or planted that session ID before impersonation began now owns a valid customer session without ever logging in.

**Fix:** A call to `session_regenerate_id(true)` is added immediately after all session variables are updated. The `true` argument tells PHP to delete the old session file on the server, not merely issue a new cookie.

**Explanation:** PHP's session fixation attack works because the session ID is a stable identifier that does not change when the privilege level changes. If an attacker tricks the agent's browser into using a session ID the attacker already knows (via a malicious link, XSS cookie write, or network interception), they only need to wait for the agent to impersonate a target and then present that same ID. Calling `session_regenerate_id(true)` after the data is written issues a new random ID to the legitimate browser and destroys the old server-side record, so the attacker's planted ID becomes immediately invalid. The rest of the auth system already does this on login and logout; this call makes impersonation consistent with that pattern. Note that `session_regenerate_id(false)` would issue a new ID but leave the old session data file alive briefly, which is still a race-condition risk, so `true` is the correct argument.

---

### Issue 2: Admin Backup Credentials Written Before ID Rotation

**Problem:** The `_original_admin_id` and `_original_admin_role` values are stored into the session before the session ID changes. In the buggy code this is harmless only because regeneration never happens, but it means the ordering logic is wrong and any future refactoring that moves regeneration earlier would expose the admin's identity in the old (potentially leaked) session file.

**Fix:** The reference solution retains the original write order (store backup, update role, then regenerate), which is the correct sequence: all data is finalized first, then `session_regenerate_id(true)` atomically migrates that data to a new ID and deletes the old file.

**Explanation:** PHP's `session_regenerate_id(true)` copies the current `$_SESSION` array to a new session file and removes the old one in a single operation. Writing backup credentials before calling it means the new session file contains them (correct) and the old file is deleted (safe). If regeneration were called before writing backup data, the agent's restore-session feature would be broken. If backup data were written after regeneration, there is a brief window where the new session exists but lacks the restore information. The chosen order — write everything, then rotate — is the only ordering that is both safe and correct.

---

### Issue 3: CSRF Token Not Rotated After Privilege Change

**Problem:** If the application uses a session-bound CSRF token, that token retains its old value after impersonation. An attacker who observed the token value during the superadmin phase (e.g., from a page source screenshot or network log) can submit forged requests against the now customer-level session using the still-valid token.

**Fix:** After `session_regenerate_id(true)`, `$_SESSION['csrf_token']` is replaced with a fresh value produced by `bin2hex(random_bytes(32))`, ensuring any previously known token is invalid.

**Explanation:** A CSRF token's security guarantee depends on it being unpredictable to an attacker. When a session transitions from one user identity to another, the token inherited from the previous identity may already be known to someone who observed that earlier session. Generating a fresh token at every privilege boundary — login, logout, and impersonation — eliminates that window. `random_bytes(32)` draws from the OS CSPRNG, giving 256 bits of entropy, which is far beyond what any attacker can guess or precompute. Forms rendered after the redirect will pick up the new token value, so legitimate users are unaffected.
