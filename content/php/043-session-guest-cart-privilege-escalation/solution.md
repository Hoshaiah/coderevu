## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Session Role Not Reset on Login
// ------------------------------------------------------------------------

<?php
// checkout/login.php

session_start();

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'web', 'secret');

$email    = $_POST['email']    ?? '';
$password = $_POST['password'] ?? '';

$stmt = $pdo->prepare('SELECT id, password_hash, role FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user && password_verify($password, $user['password_hash'])) {
    // CHANGE 2: Preserve ALL guest session keys that should survive login, not just cart, so legitimate pre-login state (e.g., guest_discount) is not lost.
    $guestData = [
        'cart'           => $_SESSION['cart']           ?? [],
        'guest_discount' => $_SESSION['guest_discount'] ?? null,
    ];

    session_regenerate_id(true);

    // CHANGE 1: Wipe the entire session after regenerating the ID so no keys (e.g., role) from a previous session on this browser can bleed into the newly authenticated session.
    session_unset();

    // CHANGE 2: Restore only the explicit guest keys we intentionally carried over.
    $_SESSION['cart']           = $guestData['cart'];
    $_SESSION['guest_discount'] = $guestData['guest_discount'];

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['role']    = $user['role'];

    header('Location: /checkout/review');
    exit;
}

echo 'Invalid credentials';
```

## Explanation

### Issue 1: Stale Session Keys Survive Login

**Problem:** When a user who previously logged in as an employee logs out (or just abandons the session without a proper logout), their `$_SESSION['role'] = 'employee'` stays in the session store. If a customer later reuses that same browser and starts a checkout session — through session fixation, shared device, or a logout that only destroys the auth keys but not the full session — they arrive at login carrying the stale `role`. Because the code never clears the session before writing the new user's data, the employee role is already present and is then overwritten… only if the write actually happens. In practice `$_SESSION['role'] = $user['role']` does run, but any other privilege key that the code did not explicitly overwrite (e.g., a custom `is_staff` flag added later) survives untouched.

**Fix:** Call `session_unset()` immediately after `session_regenerate_id(true)` and before writing any new session data. This removes every key from the current session, guaranteeing the authenticated session starts empty.

**Explanation:** `session_regenerate_id(true)` assigns a new session ID and deletes the old session file, which prevents session fixation. However it does not erase `$_SESSION` in memory — the superglobal still holds all the old values in the current request. Any key the subsequent code does not explicitly overwrite persists into the new session file when PHP writes it at request end. `session_unset()` clears `$_SESSION` in memory so the new session file is written with only the keys you intentionally set afterward. A related pitfall: calling `session_destroy()` instead would also kill the session ID itself, forcing you to call `session_start()` again; `session_unset()` is the right scalpel here.

---

### Issue 2: Incomplete Guest State Preservation

**Problem:** The original code saves only `$_SESSION['cart']` before regenerating the session. Any other key a guest accumulated — such as `$_SESSION['guest_discount']` mentioned in the context — is thrown away. After login the customer's applied discount code, referral token, or other checkout state is silently gone, causing a confusing experience and potentially incorrect order pricing.

**Fix:** Snapshot every guest key that must survive login into a local `$guestData` array before `session_regenerate_id`, then restore all of them explicitly after `session_unset()`. The reference solution adds `guest_discount` to that snapshot and restores it alongside `cart`.

**Explanation:** Because `session_unset()` (the CHANGE 1 fix) now wipes the entire session, you must be deliberate about which pre-login keys to carry forward. The pattern is: snapshot wanted keys → regenerate → unset → restore snapshot → write auth keys. This makes the preservation list explicit and auditable in code review, rather than relying on "whatever happened to be in the session stays unless overwritten". A pitfall is forgetting to update the snapshot list when a new guest session key is introduced elsewhere in the codebase; a comment near `$guestData` pointing reviewers to update it helps prevent that drift.
