---
slug: query-column-injection-orderby
track: php
orderIndex: 70
title: SQL Injection via ORDER BY Column
difficulty: hard
tags:
  - queries
  - security
  - sql-injection
  - second-order
language: php
---

## Context

The file `api/reports/transactions.php` returns a paginated, sortable list of transactions for the authenticated merchant. It accepts `sort_by` and `sort_dir` query parameters that map to SQL `ORDER BY` clauses. The developer correctly uses a prepared statement for the `WHERE` filter but ran into the limitation that PDO cannot parameterise column names or sort directions, so those are interpolated directly into the query string.

An internal security audit flagged that a curl request with `sort_by=1 UNION SELECT ...` returns unexpected rows. Standard authentication is in place and confirmed working. The issue is in the dynamic construction of the `ORDER BY` clause — specifically, the mitigation the developer wrote is incomplete.

The endpoint is only available to authenticated merchants, so the team initially triaged this as low risk. The auditors pointed out that any one of 40 000 registered merchants — including potentially fraudulent ones — can exploit it to read arbitrary tables in the shared database.

## Buggy code

```php
<?php
// api/reports/transactions.php

session_start();
if (empty($_SESSION['merchant_id'])) {
    http_response_code(401); exit;
}

$conn = new PDO('mysql:host=localhost;dbname=payments', 'app', 'secret');
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$merchantId = (int) $_SESSION['merchant_id'];
$page       = max(1, (int) ($_GET['page'] ?? 1));
$offset     = ($page - 1) * 50;

// Sanitise sort params
$sortBy  = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['sort_by'] ?? 'created_at');
$sortDir = strtoupper($_GET['sort_dir'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';

$sql = "SELECT id, amount, status, created_at
        FROM transactions
        WHERE merchant_id = :mid
        ORDER BY $sortBy $sortDir
        LIMIT 50 OFFSET :offset";

$stmt = $conn->prepare($sql);
$stmt->execute([':mid' => $merchantId, ':offset' => $offset]);

echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
```
