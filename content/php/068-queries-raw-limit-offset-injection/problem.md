---
slug: queries-raw-limit-offset-injection
track: php
orderIndex: 68
title: Raw Pagination Values in SQL Query
difficulty: medium
tags:
  - queries
  - security
  - sql-injection
language: php
---

## Context

This controller action lives in `controllers/ProductController.php` in a Laravel-adjacent plain-PHP REST API. It powers a public product catalog endpoint that supports pagination via `?page=1&per_page=20` query parameters. PDO prepared statements are used for the WHERE clause, but the LIMIT and OFFSET values are inserted differently.

A security scanner flagged the endpoint with a medium-severity SQL injection finding. The engineer who investigated said 'LIMIT and OFFSET only accept integers so they can't be injected' and closed the ticket. A follow-up tester demonstrated that the scanner was right by sending `?per_page=20 UNION SELECT username,password,3,4,5 FROM admins--` and receiving admin credentials in the response.

The codebase uses PDO with `PDO::ATTR_EMULATE_PREPARES` left at its default value of `true`, which means the driver does string interpolation itself rather than sending true parameterised queries to MySQL.

## Buggy code

```php
<?php
// controllers/ProductController.php

function getProducts(PDO $db, array $query): array
{
    $page    = max(1, (int) ($query['page'] ?? 1));
    $perPage = $query['per_page'] ?? 20;
    $offset  = ($page - 1) * (int) $perPage;

    $categoryId = $query['category_id'] ?? null;

    $sql = 'SELECT id, name, price, stock FROM products WHERE active = 1';
    $params = [];

    if ($categoryId !== null) {
        $sql .= ' AND category_id = ?';
        $params[] = (int) $categoryId;
    }

    $sql .= " ORDER BY name ASC LIMIT $perPage OFFSET $offset";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
```
