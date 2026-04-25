---
slug: query-error-ignored-silent-fail
track: php
orderIndex: 71
title: PDO Errors Silently Suppressed
difficulty: hard
tags:
  - queries
  - error-handling
  - data-integrity
language: php
---

## Context

The background worker in `workers/order_fulfillment.php` processes queued orders by writing shipment records, updating the order status to `shipped`, and decrementing inventory. It runs via a cron job every two minutes and is critical to the order pipeline. PDO was configured by a previous developer who set the error mode to `PDO::ERRMODE_SILENT` in the shared `bootstrap.php` to "avoid crashing the site on minor database hiccups."

The operations team noticed that some orders were showing `shipped` status even though no matching shipment record could be found, and inventory counts were drifting negative. The discrepancy only appears for orders where the `shipments` insert fails due to a unique-constraint violation (a race with a retry). The worker log shows no errors — only success messages.

A developer added manual `var_dump($stmt->errorInfo())` calls during a hotfix session and discovered the INSERT was silently failing, but the subsequent UPDATE and inventory decrement were still executing.

## Buggy code

```php
<?php
// workers/order_fulfillment.php

require_once __DIR__ . '/../bootstrap.php'; // sets PDO::ERRMODE_SILENT

$pdo = get_db_connection();

$stmt = $pdo->prepare(
    "SELECT id, product_id, quantity FROM orders WHERE status = 'queued' LIMIT 20"
);
$stmt->execute();
$orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($orders as $order) {
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

    echo "Processed order {$order['id']}\n";
}
```
