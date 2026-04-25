## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Missing FOR UPDATE on Stock Decrement
// ------------------------------------------------------------------------

<?php
// checkout/CartCheckout.php

function reserveStock(PDO $pdo, int $productId, int $quantity): bool
{
    $pdo->beginTransaction();

    try {
        // CHANGE 1: Added FOR UPDATE so InnoDB places an exclusive row lock immediately on read, forcing concurrent transactions to queue rather than both seeing the same stock snapshot.
        $stmt = $pdo->prepare('SELECT stock FROM products WHERE id = ? FOR UPDATE');
        $stmt->execute([$productId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || $row['stock'] < $quantity) {
            $pdo->rollBack();
            return false;
        }

        // CHANGE 2: Added AND stock >= ? to the WHERE clause so the UPDATE is a no-op if stock has already been decremented below quantity by the time the statement runs, providing a second safety net.
        $update = $pdo->prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
        $update->execute([$quantity, $productId, $quantity]);

        if ($update->rowCount() === 0) {
            $pdo->rollBack();
            return false;
        }

        $pdo->commit();
        return true;
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}
```

## Explanation

### Issue 1: Missing FOR UPDATE on stock read

**Problem:** Two checkout requests arrive at the same millisecond for the last unit of a product. Both transactions execute the plain `SELECT stock FROM products WHERE id = ?` and both read `stock = 1`. Both see enough stock, both run the `UPDATE`, and both commit — leaving `stock = -1` and two confirmed orders for one item.

**Fix:** Replace the plain `SELECT` with `SELECT stock FROM products WHERE id = ? FOR UPDATE`. This is the `CHANGE 1` site in the reference solution.

**Explanation:** Under MySQL's default `REPEATABLE READ` isolation, a plain `SELECT` takes no lock and returns a snapshot of the row from the start of the transaction. Two transactions can hold the same snapshot simultaneously with no conflict. `FOR UPDATE` tells InnoDB to acquire an exclusive row lock at read time. The second transaction trying to lock the same row must wait until the first commits or rolls back, at which point it re-reads the now-updated stock value. Because the first transaction decremented the stock to `0`, the second transaction's freshly-locked read sees `0`, the application-level check fails, and `rollBack()` is called — no oversell. A related pitfall: `FOR UPDATE` only works inside a transaction; called outside one it degrades to a plain locked read that releases immediately.

---

### Issue 2: UPDATE lacks a stock floor guard in the WHERE clause

**Problem:** Even with `FOR UPDATE` in place, if a future refactor removes the lock or the code is called from a path that skips the SELECT, the `UPDATE` will blindly subtract from whatever the current stock is, potentially driving it negative and triggering the `CHECK` constraint violation that operations already observes.

**Fix:** Change the UPDATE to `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?` and check `$update->rowCount() === 0` afterward to detect the case where no row was modified. This is the `CHANGE 2` site in the reference solution.

**Explanation:** The `AND stock >= ?` predicate makes the decrement conditional inside the database engine itself, not just in PHP. If `stock` has already dropped below `quantity` by the time the `UPDATE` runs — due to a race, a bug, or a future code path — MySQL simply matches zero rows and updates nothing. The `rowCount() === 0` check then catches this and rolls the transaction back cleanly instead of letting the constraint violation produce an exception that reaches the customer after their order confirmation was already sent. This pattern is called an optimistic guard on the write side and it complements the pessimistic lock on the read side.
