---
slug: query-raw-concat-order-clause
track: php
orderIndex: 60
title: Raw Input in GROUP BY Clause
difficulty: medium
tags:
  - queries
  - security
  - sql-injection
language: php
---

## Context

This code lives in `reports/sales_summary.php`, a back-office reporting page restricted to authenticated sales managers. It generates a summary table of sales grouped by a dimension the user selects from a dropdown (product, region, salesperson). The stack is PHP 8.1 with PDO on MySQL 8.

The security team ran a scheduled automated scan and flagged this endpoint for SQL injection despite it being behind authentication. The argument from the original developer was that prepared statements are used for all filter values, so the page is safe. The scan flagged the `GROUP BY` portion specifically.

The developer checked and confirmed that `$filter_value` (the date range) is safely bound as a parameter. They closed the ticket as a false positive. It is not a false positive.

## Buggy code

```php
<?php
// reports/sales_summary.php

if (empty($_SESSION['manager_id'])) {
    http_response_code(403);
    exit;
}

$pdo = new PDO('mysql:host=localhost;dbname=erp', 'app', 'secret');

$dimension = $_GET['group_by'] ?? 'product';  // e.g. "product", "region"
$filter_value = $_GET['since'] ?? '2024-01-01';

$sql = "SELECT {$dimension}, SUM(amount) AS total
        FROM sales
        WHERE created_at >= ?
        GROUP BY {$dimension}
        ORDER BY total DESC
        LIMIT 50";

$stmt = $pdo->prepare($sql);
$stmt->execute([$filter_value]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($rows as $row) {
    echo htmlspecialchars($row[$dimension]) . ': ' . $row['total'] . "\n";
}
```
