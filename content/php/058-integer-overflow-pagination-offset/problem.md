---
slug: integer-overflow-pagination-offset
track: php
orderIndex: 58
title: Unchecked Offset Enables Data Scraping
difficulty: medium
tags:
  - queries
  - security
  - type-coercion
language: php
---

## Context

This snippet is from `api/products.php`, a JSON endpoint that powers the product listing page of an e-commerce site. It accepts `page` and `per_page` query parameters, calculates a SQL `OFFSET`, and returns a slice of the product catalogue. The endpoint is public and unauthenticated — guests can browse products.

The operations team noticed the MySQL slow-query log filling up with `OFFSET` values in the hundreds of millions. Some requests were timing out and causing brief outages for legitimate shoppers. A look at the nginx access log showed a single IP cycling through `?page=999999999` style requests, apparently trying to enumerate the entire catalogue efficiently.

Apart from the DoS angle, the team also noticed that `per_page` values like `10000` were accepted, returning thousands of rows in a single response — far more than the UI ever requests. The developer added a `max(1, ...)` guard for `page` but did not cap either parameter at a safe ceiling.

## Buggy code

```php
<?php
// api/products.php

header('Content-Type: application/json');
require __DIR__ . '/../db.php'; // provides $pdo

$page     = max(1, (int) ($_GET['page']     ?? 1));
$per_page = max(1, (int) ($_GET['per_page'] ?? 20));

$offset = ($page - 1) * $per_page;

$stmt = $pdo->prepare(
    "SELECT id, name, price, category
       FROM products
      WHERE active = 1
      ORDER BY id
      LIMIT :limit
      OFFSET :offset"
);
$stmt->bindValue(':limit',  $per_page, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset,   PDO::PARAM_INT);
$stmt->execute();

$products = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(['data' => $products, 'page' => $page]);
```
