---
slug: like-query-wildcard-injection
track: php
orderIndex: 59
title: LIKE Wildcard Injection in Search
difficulty: medium
tags:
  - queries
  - security
  - sql
  - search
language: php
---

## Context

The file `search.php` powers a product search feature used by thousands of customers per day. It uses a PDO prepared statement, so the developer is confident there is no SQL injection. The query uses a `LIKE` clause to support partial matching of product names.

Ops noticed that the database server spikes to 100% CPU for 10-20 seconds whenever certain search terms are submitted. Checking the slow-query log reveals queries like `SELECT * FROM products WHERE name LIKE '%'` and `SELECT * FROM products WHERE name LIKE '%_%_%_%_%'` taking 15-30 seconds each and performing full-table scans across 4 million rows. No traditional SQL injection is happening — the prepared statement prevents that — but something about the user input is still causing catastrophic query behaviour.

The team already added an application-level rate limiter keyed by IP, which reduced the frequency of the spikes but did not eliminate them. The root cause in the query construction itself has not been addressed.

## Buggy code

```php
<?php
// search.php

header('Content-Type: application/json');

$conn = new PDO('mysql:host=localhost;dbname=shop', 'app', 'secret');
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$query = trim($_GET['q'] ?? '');

if (strlen($query) < 2) {
    echo json_encode([]);
    exit;
}

$stmt = $conn->prepare(
    'SELECT id, name, price FROM products WHERE name LIKE ? LIMIT 20'
);
$stmt->execute(['%' . $query . '%']);

$results = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($results);
```
