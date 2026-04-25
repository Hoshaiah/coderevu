---
slug: queries-missing-transaction-partial-insert
track: php
orderIndex: 54
title: Partial Insert Without Transaction
difficulty: easy
tags:
  - queries
  - data-integrity
  - error-handling
language: php
---

## Context

The order placement script at `checkout/place_order.php` is the critical path for the e-commerce platform. It inserts a row into `orders`, then loops over cart items to insert rows into `order_items`, then decrements stock in the `inventory` table. Each step is a separate PDO call with no wrapping transaction.

The operations team started seeing orphaned `orders` rows — orders with no associated `order_items` and with inventory not decremented. These appear after payment confirmation but before the full insert sequence completes. The symptom correlates with a database connection timeout introduced by a recent network change that occasionally drops connections mid-request.

Customer support has to manually reconcile these orders, which is taking several hours per week. A developer looked at the code and added PDO error-mode exceptions (`ERRMODE_EXCEPTION`) but didn't add transaction control, so exceptions are now thrown but the partial data is already committed.

## Buggy code

```php
<?php
// checkout/place_order.php

session_start();

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'web', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$user_id = $_SESSION['user_id'];
$cart    = $_SESSION['cart']; // array of ['product_id'=>int, 'qty'=>int, 'price'=>float]

try {
    $pdo->prepare('INSERT INTO orders (user_id, status, created_at) VALUES (?, "pending", NOW())')
        ->execute([$user_id]);
    $order_id = $pdo->lastInsertId();

    foreach ($cart as $item) {
        $pdo->prepare('INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?)')
            ->execute([$order_id, $item['product_id'], $item['qty'], $item['price']]);

        $pdo->prepare('UPDATE inventory SET stock = stock - ? WHERE product_id = ?')
            ->execute([$item['qty'], $item['product_id']]);
    }

    unset($_SESSION['cart']);
    echo json_encode(['order_id' => $order_id]);

} catch (PDOException $e) {
    error_log($e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Order failed']);
}
```
