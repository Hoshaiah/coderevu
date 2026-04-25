---
slug: type-coercion-loose-empty-zero-check
track: php
orderIndex: 81
title: empty() Treats Zero as Missing
difficulty: easy
tags:
  - type-coercion
  - correctness
  - validation
language: php
---

## Context

This function lives in `src/Inventory/StockUpdater.php`. It is called by a warehouse management webhook that sends JSON payloads whenever physical stock counts are reconciled. The `quantity` field in the payload represents the new absolute stock level, and it is valid for it to be 0 — that means the item is genuinely out of stock.

Warehouse staff noticed that setting an item's stock to zero via the reconciliation tool had no effect: the old quantity stayed in the database unchanged. Requests with any positive quantity worked fine. The webhook endpoint returned HTTP 200 either way, so the external system had no idea the update was silently skipped.

The developer who wrote the validation said they were just "checking that quantity was provided" and that `empty()` was the standard PHP way to do that.

## Buggy code

```php
<?php
// src/Inventory/StockUpdater.php

class StockUpdater
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function updateStock(int $productId, mixed $quantity): bool
    {
        if (empty($quantity)) {
            error_log("updateStock called with missing quantity for product $productId");
            return false;
        }

        if (!is_numeric($quantity) || $quantity < 0) {
            error_log("updateStock called with invalid quantity '$quantity' for product $productId");
            return false;
        }

        $stmt = $this->db->prepare(
            'UPDATE products SET stock_quantity = ?, updated_at = NOW() WHERE id = ?'
        );
        $stmt->execute([(int) $quantity, $productId]);

        return $stmt->rowCount() === 1;
    }
}
```
