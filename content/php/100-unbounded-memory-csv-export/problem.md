---
slug: unbounded-memory-csv-export
track: php
orderIndex: 100
title: >-
  CSV export loads the entire result set into memory, causing OOM on large
  tables
difficulty: medium
tags:
  - performance
  - memory
  - database
  - streaming
language: php
---

## Context

A reporting endpoint generates a CSV export of all orders for a date range. It works fine in development, but the ops team receives OOM alerts from the production PHP-FPM pool whenever a date range covers more than a few weeks of data — the orders table has tens of millions of rows and the process hits the 512 MB memory limit before it can stream anything.

## Buggy code

```php
<?php
// reports/export_orders.php

session_start();
if (empty($_SESSION['admin_id'])) {
    http_response_code(403);
    exit;
}

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', getenv('DB_PASSWORD'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$from = $_GET['from'] ?? date('Y-m-01');
$to   = $_GET['to']   ?? date('Y-m-d');

$stmt = $pdo->prepare(
    'SELECT id, customer_email, total_cents, status, created_at
     FROM orders
     WHERE created_at BETWEEN ? AND ?'
);
$stmt->execute([$from, $to]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="orders.csv"');

$out = fopen('php://output', 'w');
fputcsv($out, ['ID', 'Email', 'Total (cents)', 'Status', 'Created At']);

foreach ($rows as $row) {
    fputcsv($out, $row);
}

fclose($out);
```
