---
slug: queries-group-by-implicit-column
track: php
orderIndex: 72
title: Non-Deterministic GROUP BY Aggregation
difficulty: hard
tags:
  - queries
  - correctness
  - mysql
language: php
---

## Context

The reporting endpoint in `reports/sales_by_rep.php` generates a sales summary table. It is used by sales managers in a daily dashboard to see each representative's total and the date of their most recent sale. The query groups by `rep_id` and uses `MAX(sale_date)` to get the latest sale, but also selects `order_id` and `customer_name` without aggregating them.

Managers have noticed that the `order_id` column in the report sometimes shows a different order than the one matching `MAX(sale_date)`. The development team has reproduced it but only on the staging database, which runs with `ONLY_FULL_GROUP_BY` disabled in `sql_mode`. Production MySQL 8 has `ONLY_FULL_GROUP_BY` enabled by default and the query raises an error there, which was silently caught and an empty result returned — explaining why the dashboard shows no data on Mondays.

## Buggy code

```php
<?php
// reports/sales_by_rep.php

$pdo = new PDO('mysql:host=localhost;dbname=sales', 'reporting', 'secret', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// Returns one row per sales rep: their total, most recent sale date,
// and — supposedly — the order_id/customer from that most recent sale.
$stmt = $pdo->query(
    'SELECT
        r.name          AS rep_name,
        s.rep_id,
        s.order_id,
        s.customer_name,
        MAX(s.sale_date) AS latest_sale,
        SUM(s.amount)    AS total_amount
     FROM sales s
     JOIN reps r ON r.id = s.rep_id
     GROUP BY s.rep_id'
);

$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
header('Content-Type: application/json');
echo json_encode($rows);
```
