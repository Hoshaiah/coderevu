---
slug: queries-missing-for-update-lock
track: php
orderIndex: 74
title: Missing FOR UPDATE on Stock Decrement
difficulty: hard
tags:
  - queries
  - concurrency
  - transactions
  - race-condition
language: php
---

## Context

This function is in `checkout/CartCheckout.php` and is called when a customer completes an order. It runs inside a transaction that checks available stock, decrements it, and inserts an order row. The `products` table has a `stock` column with a `CHECK (stock >= 0)` constraint. The application runs on PHP-FPM with 32 worker processes sharing one MySQL 8 database.

On popular flash-sale days, operations receives alerts that the constraint is being violated and orders for the same product are overselling. SHOW ENGINE INNODB STATUS shows high lock-wait timeouts during peak load. Despite the transaction, two simultaneous checkouts for the last unit of a product both succeed, resulting in a stock level of `-1` before the constraint catches it and rolls one transaction back — but not before both orders are confirmed to the customers.

The team verified that the transaction isolation level is `REPEATABLE READ` (MySQL default) and that the `CHECK` constraint exists. They believe the transaction should protect them, but it does not in this case.

## Buggy code

```php
<?php
// checkout/CartCheckout.php

function reserveStock(PDO $pdo, int $productId, int $quantity): bool
{
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare('SELECT stock FROM products WHERE id = ?');
        $stmt->execute([$productId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || $row['stock'] < $quantity) {
            $pdo->rollBack();
            return false;
        }

        $update = $pdo->prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
        $update->execute([$quantity, $productId]);

        $pdo->commit();
        return true;
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}
```
