---
slug: query-in-loop-n-plus-one
track: php
orderIndex: 53
title: N+1 Queries in Order Listing
difficulty: easy
tags:
  - queries
  - performance
  - n-plus-one
language: php
---

## Context

The file `admin/orders/index.php` renders a paginated table of the most recent 50 orders for the back-office team. Each row shows the order ID, total, status, and the customer's full name and email. Orders are stored in an `orders` table; customer details live in a separate `users` table, joined by `orders.user_id`. The page was written quickly during a deadline crunch and has been in production for six months.

After the business grew to tens of thousands of orders the admin team started complaining the orders page takes 8–12 seconds to load. A slow-query log shows no individual query taking more than 5 ms, but the application log reveals 51 database round-trips on every page load. Server CPU and memory are fine.

A developer profiled the page with Blackfire and confirmed that the time is spent waiting on sequential database queries, not on PHP computation. The pagination logic and the outer query are correct.

## Buggy code

```php
<?php
// admin/orders/index.php

require_once __DIR__ . '/../../bootstrap.php';

$pdo  = get_db_connection();
$page = max(1, (int) ($_GET['page'] ?? 1));
$offset = ($page - 1) * 50;

$stmt = $pdo->prepare(
    "SELECT id, user_id, total, status, created_at
       FROM orders
      ORDER BY created_at DESC
      LIMIT 50 OFFSET ?"
);
$stmt->execute([$offset]);
$orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "<table><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr>";

foreach ($orders as $order) {
    $ustmt = $pdo->prepare("SELECT name, email FROM users WHERE id = ?");
    $ustmt->execute([$order['user_id']]);
    $user = $ustmt->fetch(PDO::FETCH_ASSOC);

    echo "<tr>";
    echo "<td>" . htmlspecialchars($order['id'], ENT_QUOTES, 'UTF-8') . "</td>";
    echo "<td>" . htmlspecialchars($user['name'] . ' &lt;' . $user['email'] . '&gt;', ENT_QUOTES, 'UTF-8') . "</td>";
    echo "<td>" . htmlspecialchars(number_format($order['total'] / 100, 2), ENT_QUOTES, 'UTF-8') . "</td>";
    echo "<td>" . htmlspecialchars($order['status'], ENT_QUOTES, 'UTF-8') . "</td>";
    echo "</tr>";
}

echo "</table>";
```
