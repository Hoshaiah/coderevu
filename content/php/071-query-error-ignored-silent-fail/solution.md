## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — PDO Errors Silently Suppressed
// ------------------------------------------------------------------------

<?php
// workers/order_fulfillment.php

require_once __DIR__ . '/../bootstrap.php'; // previously set PDO::ERRMODE_SILENT

$pdo = get_db_connection();

// CHANGE 1: Switch error mode to ERRMODE_EXCEPTION so any PDO failure throws instead of silently returning false; this overrides the bootstrap setting locally so the worker always surfaces real errors without changing site-wide behaviour.
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$stmt = $pdo->prepare(
    "SELECT id, product_id, quantity FROM orders WHERE status = 'queued' LIMIT 20"
);
$stmt->execute();
$orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($orders as $order) {
    // CHANGE 2: Wrap all three DML statements in a transaction so that if any step throws, the entire unit of work is rolled back and the order stays in its original state rather than being partially updated.
    $pdo->beginTransaction();
    try {
        // Insert shipment record
        $ins = $pdo->prepare(
            "INSERT INTO shipments (order_id, shipped_at) VALUES (?, NOW())"
        );
        $ins->execute([$order['id']]);

        // Mark order as shipped
        $upd = $pdo->prepare(
            "UPDATE orders SET status = 'shipped', updated_at = NOW() WHERE id = ?"
        );
        $upd->execute([$order['id']]);

        // Decrement inventory
        $inv = $pdo->prepare(
            "UPDATE inventory SET qty = qty - ? WHERE product_id = ?"
        );
        $inv->execute([$order['quantity'], $order['product_id']]);

        $pdo->commit();
        // CHANGE 3: Only log success after commit so the message reflects that all three operations actually completed; previously this line ran even when the INSERT had silently failed.
        echo "Processed order {$order['id']}\n";
    } catch (PDOException $e) {
        $pdo->rollBack();
        // Log the real error so ops can see which order failed and why.
        error_log("Order {$order['id']} failed: " . $e->getMessage());
    }
}
```

## Explanation

### Issue 1: Silent PDO error mode hides INSERT failures

**Problem:** When the shipments INSERT hits a unique-constraint violation (a duplicate `order_id` from a retry), PDO silently returns `false` and sets an error code internally but never tells the caller. The code treats the failed execute call as a success and immediately runs the UPDATE and inventory decrement, producing an order with `shipped` status and no matching shipment row.

**Fix:** Add `$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION)` immediately after obtaining the connection. This makes every failed PDO call throw a `PDOException` instead of setting a silent error code.

**Explanation:** `PDO::ERRMODE_SILENT` (the default) stores error details in `errorInfo()` but never raises them automatically. Code that does not call `errorInfo()` after every execute will never know anything went wrong. Switching to `ERRMODE_EXCEPTION` moves error detection out of the caller's hands — any failed statement throws, so control flow cannot continue past the failure point. Setting the attribute on the connection object in the worker overrides the bootstrap value only for this process, so the website's PDO connections are unaffected. A related pitfall: `ERRMODE_WARNING` would emit a PHP warning but still let execution continue past the failed call, which is usually not what you want in a pipeline worker.

---

### Issue 2: No transaction around the three-step fulfillment unit

**Problem:** Even after surfacing errors, if the UPDATE or inventory decrement fails after the INSERT has already succeeded, the database is left in a half-applied state. Operations sees a shipment record with no `shipped` status, or a shipped order with no inventory deduction.

**Fix:** Wrap the INSERT, UPDATE, and inventory decrement in `$pdo->beginTransaction()` / `$pdo->commit()`, with a `catch` block that calls `$pdo->rollBack()`. All three statements now succeed together or none of them is persisted.

**Explanation:** A database transaction guarantees atomicity: the engine applies all changes only when `COMMIT` is issued, and discards all of them on `ROLLBACK`. Without a transaction, each statement auto-commits immediately, so a failure midway through leaves whatever ran before it permanently written. In this worker the three statements form a single logical operation — inserting a shipment, marking the order, and adjusting stock are inseparable — so they must be atomic. The catch block calls `rollBack()` and logs the exception, which keeps the order in `queued` status so the next cron run retries it cleanly. One pitfall: if `beginTransaction()` itself throws (e.g., a nested transaction), the catch block's `rollBack()` would also fail; for this worker a flat, non-nested structure avoids that.

---

### Issue 3: Success message logged before confirming all statements succeeded

**Problem:** The `echo "Processed order ..."` line runs unconditionally after the three execute calls, so the worker log shows a success entry even when the INSERT silently failed and the order was never actually fulfilled. Operations and automated monitors see clean logs and assume everything is fine.

**Fix:** Move the `echo` inside the `try` block, after `$pdo->commit()`. It now only runs when all three statements committed successfully.

**Explanation:** Logging after the work is confirmed rather than after submitting the work is a basic correctness property for pipeline workers: the log entry should be evidence that the state change happened, not just that the code reached a certain line. By placing the echo after `commit()`, any exception — from the INSERT, the UPDATE, the decrement, or even the commit itself — will bypass the log line and instead write a real error via `error_log()`. This gives operations an accurate picture of how many orders were genuinely fulfilled per cron run, and surfaces failures immediately rather than requiring manual `errorInfo()` inspection.
