---
slug: queries-like-input-unescaped-wildcard
track: php
orderIndex: 55
title: Unescaped Wildcards in LIKE Clause
difficulty: easy
tags:
  - queries
  - security
  - sql
language: php
---

## Context

The file `search/products.php` handles product search for a mid-size e-commerce platform. It uses PDO with prepared statements, so the development team considers it safe from SQL injection. The query uses a `LIKE` clause to support partial matching on product names.

Customer support has received complaints that searching for `%` or `_` returns every product in the catalogue, and searching for a model number like `AB_200` returns unrelated products such as `AB1200` and `AB-200`. The backend team reviewed the code and said "the query is parameterised, so it's fine" — but the bug is in the input, not the query structure.

## Buggy code

```php
<?php
// search/products.php

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', 'password');

$term = $_GET['q'] ?? '';

$stmt = $pdo->prepare(
    'SELECT id, name, price FROM products WHERE name LIKE ? LIMIT 50'
);
$stmt->execute(["%{$term}%"]);
$products = $stmt->fetchAll(PDO::FETCH_ASSOC);

header('Content-Type: application/json');
echo json_encode($products);
```
