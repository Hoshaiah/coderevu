## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Coupon redemption endpoint allows the same coupon to be used multiple times under concurrent load
// ------------------------------------------------------------------------
<?php
// api/redeem_coupon.php

header('Content-Type: application/json');

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', getenv('DB_PASSWORD'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$body   = json_decode(file_get_contents('php://input'), true);
$code   = trim($body['coupon_code'] ?? '');
$userId = (int) ($body['user_id'] ?? 0);

if (!$code || !$userId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing parameters']);
    exit;
}

// CHANGE 2: Wrap the check-then-update in a transaction so a crash between the two statements cannot leave the coupon in a partially-redeemed state.
$pdo->beginTransaction();

try {
    // CHANGE 1: Use SELECT ... FOR UPDATE to acquire a row-level lock. Any concurrent request that also reaches this line will block until this transaction commits or rolls back, eliminating the race condition.
    $stmt = $pdo->prepare('SELECT id, used FROM coupons WHERE code = ? FOR UPDATE');
    $stmt->execute([$code]);
    $coupon = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$coupon || $coupon['used']) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(['error' => 'Coupon invalid or already used']);
        exit;
    }

    // CHANGE 3: Add `used = 0` to the WHERE clause so the UPDATE affects zero rows if a concurrent writer already marked the coupon used, turning a silent double-redemption into a detectable no-op.
    $update = $pdo->prepare(
        'UPDATE coupons SET used = 1, redeemed_by = ? WHERE id = ? AND used = 0'
    );
    $update->execute([$userId, $coupon['id']]);

    if ($update->rowCount() === 0) {
        // Another concurrent request won the race; treat as already used.
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(['error' => 'Coupon invalid or already used']);
        exit;
    }

    $pdo->commit();

    echo json_encode(['discount' => '20%', 'coupon_id' => $coupon['id']]);

} catch (Exception $e) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
    exit;
}
```

## Explanation

### Issue 1: Race condition on coupon-used check

**Problem:** Two HTTP requests arrive at nearly the same time with the same coupon code. Both execute the `SELECT` before either executes the `UPDATE`, so both see `used = 0` and both proceed past the guard. The customer receives the discount twice.

**Fix:** The `SELECT` statement gains a `FOR UPDATE` suffix, becoming `SELECT id, used FROM coupons WHERE code = ? FOR UPDATE`. This is wrapped inside a transaction (see Change 2), so MySQL acquires a row-level exclusive lock the moment the first request reads the row. The second concurrent request blocks at the same `SELECT FOR UPDATE` until the first transaction commits, then reads `used = 1` and exits with a 409.

**Explanation:** Without `FOR UPDATE`, a plain `SELECT` in MySQL (InnoDB) takes no lock and returns a snapshot. Two connections can read the same snapshot simultaneously and both decide the coupon is unused. `FOR UPDATE` tells the engine to lock the row for the duration of the transaction, serializing all other `SELECT FOR UPDATE` attempts against the same row. The second request does not race; it waits. Once the first transaction commits and the lock releases, the second request re-reads the now-updated row. A related pitfall: `FOR UPDATE` only works inside an explicit transaction; without `beginTransaction()` each statement auto-commits immediately and the lock evaporates, which is exactly why Change 2 is also required.

---

### Issue 2: No transaction wrapping check-and-update

**Problem:** The original code runs the `SELECT` and the `UPDATE` as two separate auto-committed statements. If the PHP process crashes, the web server kills the request, or a network error occurs between those two statements, the coupon row is never marked used even though the discount may already have been applied downstream.

**Fix:** `$pdo->beginTransaction()` is called before the `SELECT`, and `$pdo->commit()` is called after a successful `UPDATE`. A `catch` block calls `$pdo->rollBack()` on any exception. Every early-exit path (invalid coupon, zero `rowCount`) also calls `$pdo->rollBack()` before `exit`.

**Explanation:** Auto-commit mode means every statement is its own atomic unit. There is a window between the `SELECT` and the `UPDATE` where the system state is inconsistent: the code has decided to grant the discount but has not yet recorded that decision in the database. An explicit transaction closes that window. If anything goes wrong mid-flight, the rollback leaves the row unchanged and the next request can retry cleanly. The transaction is also the prerequisite for `FOR UPDATE` locking (Change 1) to have any effect beyond the single-statement boundary.

---

### Issue 3: UPDATE does not re-check `used` in WHERE clause

**Problem:** Even with a transaction and a lock, a defense-in-depth gap exists: if the locking is somehow bypassed (e.g., a direct database write, a future code path that skips the lock, or a different storage engine), the `UPDATE` will happily set `used = 1` without confirming the row was still unused, and `rowCount()` will return 1 regardless.

**Fix:** The `UPDATE` statement gains `AND used = 0` in its `WHERE` clause: `UPDATE coupons SET used = 1, redeemed_by = ? WHERE id = ? AND used = 0`. After `execute()`, `$update->rowCount()` is checked; if it returns `0`, the transaction is rolled back and a 409 is returned.

**Explanation:** This is an optimistic-locking check at the database level. The row is only updated when the database can confirm it is still in the expected state at the moment of the write. If two requests somehow both pass the `SELECT` check (e.g., under a non-locking read), the database ensures only one `UPDATE` affects a row because the second one finds `used = 1` and matches zero rows. Checking `rowCount() === 0` converts that silent no-op into an explicit application-level rejection. This pattern is useful independently of transactions: it makes the write itself idempotent and auditable at the SQL layer.
