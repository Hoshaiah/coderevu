---
slug: type-coercion-in-range-loose-compare
track: php
orderIndex: 85
title: Loose Comparison in Range Check
difficulty: medium
tags:
  - type-coercion
  - validation
  - correctness
language: php
---

## Context

This is `src/Billing/DiscountValidator.php`, part of a SaaS billing service. When a customer submits a discount code through the checkout API, this method validates that the attached percentage is within the allowed range (1–100). The discount record is fetched from a MySQL table via PDO, which returns all columns as strings by default.

Accounting flagged that several orders have a computed price of zero even though no 100%-off codes were ever issued. Reviewing the order log shows `discount_percent` values like `"0"` and `"false"` being accepted as valid, and in some cases arithmetic produces unexpected results downstream.

The developer who wrote the check said: "I test for `>= 1` and `<= 100`, that should cover it." The issue is subtler than an off-by-one.

## Buggy code

```php
<?php
// src/Billing/DiscountValidator.php

class DiscountValidator
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function validate(string $code): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT code, discount_percent, expires_at FROM discount_codes WHERE code = ?"
        );
        $stmt->execute([$code]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return ['valid' => false, 'reason' => 'Code not found'];
        }

        $pct = $row['discount_percent']; // PDO returns this as a string, e.g. "10"

        if ($pct >= 1 && $pct <= 100) {
            return ['valid' => true, 'percent' => $pct];
        }

        return ['valid' => false, 'reason' => 'Percent out of range'];
    }
}
```
