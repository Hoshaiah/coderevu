---
slug: queries-subquery-correlated-cartesian
track: php
orderIndex: 66
title: Correlated Subquery Causes Table Scan
difficulty: medium
tags:
  - queries
  - performance
  - mysql
language: php
---

## Context

This function lives in `reports/SalesReport.php` and is run nightly by a cron job to generate a summary of each sales representative's performance. The `orders` table has approximately 4 million rows and `sales_reps` has around 800 rows. Both tables are on a dedicated MySQL 8 RDS instance with appropriate indexes on `orders.rep_id` and `orders.created_at`.

The cron job that took 3 seconds to run six months ago now times out after 300 seconds. The DBA checked slow-query logs and found the query inside this function is performing a full table scan on `orders` 800 times — once per sales rep. Database CPU spikes to 100% for the duration of the job.

The team added an index on `orders.total_amount` hoping it would help but saw no improvement. The problem is structural, not an indexing gap.

## Buggy code

```php
<?php
// reports/SalesReport.php

function getSalesRepSummary(PDO $pdo): array
{
    $sql = "
        SELECT
            sr.id,
            sr.name,
            (SELECT COUNT(*)
             FROM orders o
             WHERE o.rep_id = sr.id
               AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS order_count,
            (SELECT SUM(o.total_amount)
             FROM orders o
             WHERE o.rep_id = sr.id
               AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS total_sales
        FROM sales_reps sr
        ORDER BY total_sales DESC
    ";

    $stmt = $pdo->query($sql);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
```
