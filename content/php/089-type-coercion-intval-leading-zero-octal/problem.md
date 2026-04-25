---
slug: type-coercion-intval-leading-zero-octal
track: php
orderIndex: 89
title: intval Misparses Octal User Input
difficulty: medium
tags:
  - type-coercion
  - queries
  - correctness
language: php
---

## Context

This function is part of `api/UpdateInventory.php`, an internal warehouse API consumed by a barcode scanner application. Warehouse workers scan a product barcode and enter a new stock count. The scanner firmware zero-pads all counts to eight digits (e.g. `00000042` for 42 units), which was a documented quirk noted in the integration spec.

The warehouse team reports that stock levels are being set to wildly incorrect values for any count whose zero-padded form starts with a zero and contains only the digits 0–7. For example, entering a count of `56` (sent as `00000056`) sets the inventory to `46` — the octal value of `56`. Counts above `07` (e.g. `00000099`) work correctly. A count of `00000010` sets stock to `8` instead of `10`.

The bug was not caught in QA because the test fixtures used non-padded integers. The DBA confirmed the database values are being written incorrectly, ruling out a display bug.

## Buggy code

```php
<?php
// api/UpdateInventory.php

function updateStockCount(PDO $pdo, int $productId, string $rawCount): bool
{
    // Scanner firmware sends zero-padded 8-digit strings; convert to int
    $count = intval($rawCount, 0);

    if ($count < 0) {
        throw new InvalidArgumentException("Stock count cannot be negative.");
    }

    $stmt = $pdo->prepare('UPDATE products SET stock = ? WHERE id = ?');
    return $stmt->execute([$count, $productId]);
}
```
