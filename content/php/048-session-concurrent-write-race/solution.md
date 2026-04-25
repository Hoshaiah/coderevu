## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Session Write Race on Balance Update
// ------------------------------------------------------------------------

<?php
// wallet/spend.php

session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(403);
    exit;
}

$cost   = (int) ($_POST['cost']   ?? 0);
$item   = (string) ($_POST['item'] ?? '');

if ($cost <= 0) {
    exit('Invalid cost');
}

$pdo = new PDO('mysql:host=localhost;dbname=app', 'web', 'secret');

// CHANGE 1: Remove the session-based pre-check entirely. The session value is not protected by any lock, so two simultaneous requests both see the same balance, both pass, and both deduct — the only authoritative check must happen inside the DB transaction where FOR UPDATE serialises access. The fast-path session check has been intentionally deleted; correctness requires the DB to be the single source of truth for the balance gate.

// CHANGE 2: Close the session (write + unlock) before starting the DB transaction so the PHP session file lock is released immediately and does not block other requests for this user for the entire duration of the transaction.
session_write_close();

// Deduct in DB with a transaction
$pdo->beginTransaction();
$stmt = $pdo->prepare('SELECT points FROM wallets WHERE user_id = ? FOR UPDATE');
$stmt->execute([$_SESSION['user_id']]);
$db_balance = $stmt->fetchColumn();

if ($db_balance < $cost) {
    $pdo->rollBack();
    exit('Insufficient points');
}

$pdo->prepare('UPDATE wallets SET points = points - ? WHERE user_id = ?')
    ->execute([$cost, $_SESSION['user_id']]);
$pdo->commit();

// CHANGE 3: Re-read the authoritative post-deduction balance from the DB instead of deriving it from the (now closed and potentially stale) session value, so the response always reflects the real DB state.
$stmt2 = $pdo->prepare('SELECT points FROM wallets WHERE user_id = ?');
$stmt2->execute([$_SESSION['user_id']]);
$new_balance = (int) $stmt2->fetchColumn();

// Reopen the session briefly to sync the refreshed balance back into it.
session_start();
$_SESSION['points'] = $new_balance;
session_write_close();

echo json_encode(['ok' => true, 'remaining' => $new_balance]);
```

## Explanation

### Issue 1: Session balance check not serialised

**Problem:** Two browser tabs submit the spend form at the same time. Both calls run `session_start()`, both read `$_SESSION['points']` (say, 100), both see 100 >= cost (say, 60), and both proceed. The `SELECT FOR UPDATE` inside the transaction serialises the DB writes correctly, but by that point both requests have already passed the application-level gate using the same stale value. One or both deductions then push the DB balance negative.

**Fix:** The pre-transaction session balance check (the `if ($_SESSION['points'] < $cost)` block) is deleted entirely at CHANGE 1. The DB-level check inside the transaction — which is protected by `FOR UPDATE` — becomes the only gate.

**Explanation:** PHP's session file lock serialises reads/writes *to the session file* for a single user, but it does not tie the session read to the subsequent DB write in any atomic way. Two requests can each acquire and release the session lock in turn, each reading the same value, and each deciding to proceed. The `SELECT FOR UPDATE` in MySQL acquires a row-level lock that forces the second transaction to wait until the first commits, so the second transaction sees the already-deducted balance and can reject correctly. Removing the session check means the race-prone fast path is gone and the DB transaction is the single source of truth.

---

### Issue 2: Session file lock held across DB transaction

**Problem:** `session_start()` acquires a lock on the session file. Because the code never calls `session_write_close()` before opening the DB transaction, that file lock is held for the entire round-trip to MySQL — including the `SELECT FOR UPDATE` wait time, the update, and the commit. Any other request for the same user (e.g., a page load in another tab) is blocked until the transaction finishes.

**Fix:** `session_write_close()` is called at CHANGE 2, immediately before `$pdo->beginTransaction()`. This flushes and unlocks the session file before entering the DB transaction.

**Explanation:** PHP's default `files` session handler uses `flock` on the session file. While that lock is held, any other script that calls `session_start()` for the same session ID blocks. A slow DB transaction (especially one waiting on a row lock) can therefore stall unrelated requests — navigation, API calls, anything in the same session. Releasing the session lock early with `session_write_close()` limits the lock hold-time to the initial setup work and lets other requests for the same user proceed in parallel during the DB round-trip.

---

### Issue 3: Session balance derived from stale session instead of DB

**Problem:** After the DB commit, the code does `$_SESSION['points'] -= $cost`. If the session value was already out of sync with the DB (e.g., a concurrent request committed between the login session-write and this request), the new session value is computed from wrong data. Over time the session and DB drift further apart, and the response reports a balance that does not match reality.

**Fix:** At CHANGE 3, a second `SELECT` fetches the actual post-deduction balance from the DB. That value is written back to `$_SESSION['points']` (after re-opening the session with a fresh `session_start()`) and is also used in the JSON response, replacing the arithmetic on the old session value.

**Explanation:** Arithmetic like `$session -= $cost` is only correct if `$session` is already accurate. Because the session is written at login and only updated optimistically, any out-of-band change to the wallet (admin adjustment, concurrent spend that committed first, etc.) makes the session stale. Reading the DB value immediately after the committed update gives the ground truth. Re-opening the session briefly to store it keeps the cache warm for future requests without introducing a new race, because no balance decision is made on that re-opened session value.
