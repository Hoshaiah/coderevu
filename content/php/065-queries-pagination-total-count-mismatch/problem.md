---
slug: queries-pagination-total-count-mismatch
track: php
orderIndex: 65
title: COUNT Query Ignores Active Filter
difficulty: medium
tags:
  - queries
  - correctness
  - pagination
language: php
---

## Context

The class method below is part of `src/Repository/ProductRepository.php` in a Laravel-adjacent custom framework used by an inventory management tool. It powers the paginated product list visible to warehouse staff, which can be filtered to show only active (non-discontinued) products.

Warehouse staff report that the pagination controls are wrong: when the "active only" filter is applied, the page count and "showing X of Y" text report the total number of products including discontinued ones. Clicking "next page" past the real result count returns an empty page. The team initially suspected a caching issue but clearing caches had no effect.

The application uses PDO with MySQL. The `products` table has roughly 12,000 rows, 3,000 of which are active.

## Buggy code

```php
<?php
// src/Repository/ProductRepository.php

class ProductRepository
{
    public function __construct(private PDO $pdo) {}

    public function listPaginated(
        int  $page,
        int  $perPage,
        bool $activeOnly = false
    ): array {
        $offset = ($page - 1) * $perPage;
        $params = [];

        $where = '';
        if ($activeOnly) {
            $where    = 'WHERE active = 1';
            $params[] = 1;
        }

        // Count all products — used for total-page calculation
        $countStmt = $this->pdo->query('SELECT COUNT(*) FROM products');
        $total     = (int) $countStmt->fetchColumn();

        $sql  = "SELECT id, sku, name, price FROM products $where LIMIT ? OFFSET ?";
        $params[] = $perPage;
        $params[] = $offset;

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'data'  => $rows,
            'total' => $total,
            'page'  => $page,
        ];
    }
}
```
