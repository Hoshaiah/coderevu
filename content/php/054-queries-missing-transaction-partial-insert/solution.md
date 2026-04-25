## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Partial Insert Without Transaction
// ------------------------------------------------------------------------

<?php
// checkout/place_order.php

session_start();

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'web', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$user_id = $_SESSION['user_id'];
$cart    = $_SESSION['cart']; // array of ['product_id'=>int, 'qty'=>int, 'price'=>float]

try {
    // CHANGE 1: Begin a transaction so every INSERT/UPDATE is part of one atomic unit; if anything fails, the whole batch can be rolled back.
    $pdo->beginTransaction();

    $pdo->prepare('INSERT INTO orders (user_id, status, created_at) VALUES (?, "pending", NOW())')
        ->execute([$user_id]);
    $order_id = $pdo->lastInsertId();

    // CHANGE 3: Prepare both statements once outside the loop to avoid redundant round-trips to the database server on every cart item.
    $stmtItem  = $pdo->prepare('INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?)');
    $stmtStock = $pdo->prepare('UPDATE inventory SET stock = stock - ? WHERE product_id = ?');

    foreach ($cart as $item) {
        // CHANGE 3: Execute the pre-prepared statements instead of calling prepare() again inside the loop.
        $stmtItem->execute([$order_id, $item['product_id'], $item['qty'], $item['price']]);
        $stmtStock->execute([$item['qty'], $item['product_id']]);
    }

    // CHANGE 1: Commit only after all inserts and inventory updates succeed, making the entire sequence atomic.
    $pdo->commit();

    unset($_SESSION['cart']);
    echo json_encode(['order_id' => $order_id]);

} catch (PDOException $e) {
    // CHANGE 2: Roll back the transaction on any exception so partial writes (e.g. an orders row with no items) are reversed automatically.
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log($e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Order failed']);
}
```

## Explanation

### Issue 1: No transaction wraps multi-step writes

**Problem:** Each `INSERT` and `UPDATE` commits the moment it executes. When a network timeout drops the connection after the `orders` row is inserted but before `order_items` rows are written, the database retains the `orders` row permanently. Operations staff see orders with no line items and inventory that was never decremented.

**Fix:** `$pdo->beginTransaction()` is added immediately before the first `INSERT`, and `$pdo->commit()` is added after the loop completes successfully. These two calls are the CHANGE 1 sites.

**Explanation:** Without a transaction, MySQL's default auto-commit mode treats every statement as its own transaction and commits it instantly. Wrapping all statements in an explicit transaction means the database holds every change in a pending state until `commit()` is called. If the connection drops at any point before `commit()`, MySQL discards all pending changes from that transaction automatically, so no partial data survives. A related pitfall: `lastInsertId()` still returns the correct value for the pending `orders` row even inside an open transaction, so the foreign key values passed to `order_items` are valid.

---

### Issue 2: Catch block does not roll back on failure

**Problem:** Even after `ERRMODE_EXCEPTION` was enabled, the `catch` block only logs and returns an error response. Any partial writes that reached the database before the exception are already committed (under auto-commit) and remain there. The rollback that should clean them up is missing entirely.

**Fix:** `$pdo->rollBack()` is added inside the `catch` block, guarded by `$pdo->inTransaction()` to avoid a PDO error if the exception fires before `beginTransaction()` is called. This is the CHANGE 2 site.

**Explanation:** `ERRMODE_EXCEPTION` tells PDO to throw instead of silently returning `false`, but it does nothing to undo work already sent to the database. Once `beginTransaction()` is in place (Issue 1), calling `rollBack()` in the catch block instructs MySQL to discard every statement that ran during the open transaction. The `inTransaction()` guard is a defensive measure: if the constructor or `setAttribute` call throws before `beginTransaction()` runs, calling `rollBack()` unconditionally would itself throw a PDO error, masking the original exception.

---

### Issue 3: Statements prepared inside the loop on every iteration

**Problem:** `$pdo->prepare()` sends the SQL to the server and compiles a query plan. Calling it inside the `foreach` loop means the server re-parses and re-plans the same two queries once per cart item. For a cart with ten items, that is twenty unnecessary round-trips.

**Fix:** Both `prepare()` calls are moved outside the loop into `$stmtItem` and `$stmtStock` variables before the `foreach`. Inside the loop, only `execute()` is called on those pre-prepared handles. These are the CHANGE 3 sites.

**Explanation:** A prepared statement separates the compilation step from the execution step. Moving `prepare()` outside the loop means the server compiles each query exactly once per request, regardless of cart size. Subsequent `execute()` calls reuse the compiled plan and only transmit the parameter values, cutting both round-trip count and server CPU. This is especially valuable when the cart is large or when MySQL is accessed over a high-latency link, which is already a concern given the network changes mentioned in the incident context.
