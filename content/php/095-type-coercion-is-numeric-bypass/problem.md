---
slug: type-coercion-is-numeric-bypass
track: php
orderIndex: 95
title: is_numeric Allows Hex Injection
difficulty: hard
tags:
  - type-coercion
  - security
  - validation
  - queries
language: php
---

## Context

This is `src/Api/ReportController.php`, an internal reporting API that accepts a numeric `account_id` parameter and passes it to a raw SQL query. The developer used `is_numeric()` to validate the input, believing it would allow only decimal integers — which is what the column type requires.

A security review identified that the validation is bypassable. An attacker who can call this endpoint (authenticated internal users, of which there are many) can exfiltrate data from other accounts or columns by exploiting the gap between what `is_numeric()` accepts and what MySQL treats as a valid integer expression.

The developer responded: "`is_numeric()` returns true only for numbers, and numbers are safe in SQL." The researcher pointed them to the PHP documentation footnote about hexadecimal strings.

## Buggy code

```php
<?php
// src/Api/ReportController.php

class ReportController
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function getAccountSummary(array $params): array
    {
        $accountId = $params['account_id'] ?? '';

        if (!is_numeric($accountId)) {
            http_response_code(400);
            return ['error' => 'account_id must be numeric'];
        }

        // Believed safe because $accountId passed is_numeric()
        $sql = "SELECT id, balance, owner_name FROM accounts WHERE id = $accountId";
        $stmt = $this->pdo->query($sql);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
```
