---
slug: queries-unparameterised-in-clause-ids
track: php
orderIndex: 57
title: Raw IDs Concatenated Into IN Clause
difficulty: easy
tags:
  - queries
  - security
  - sql-injection
language: php
---

## Context

This function is in `api/BulkExport.php` and is used by the internal reporting dashboard to export a batch of order records by their IDs. The IDs are selected by the user in the dashboard UI via checkboxes and sent as a comma-separated query string. The endpoint is accessible only to authenticated internal users, and management decided it was low-risk because employees are trusted.

A security audit flagged this endpoint as SQL-injectable. The auditor demonstrated that appending `,0 UNION SELECT username,password,3,4,5 FROM admins--` to the `ids` parameter exfiltrates the admin credentials table. The engineering lead argued that employees wouldn't do that, but the auditor noted that XSS on any internal page could trigger this endpoint with a crafted payload on behalf of a logged-in employee.

The team considered using `PDO::quote()` on each ID but was unsure of the correct approach for a variable-length `IN` clause.

## Buggy code

```php
<?php
// api/BulkExport.php

require_once 'db.php';
require_once 'auth.php';

requireAuth();

$rawIds = $_GET['ids'] ?? '';
// e.g. "12,45,78"

if (empty($rawIds)) {
    echo json_encode([]);
    exit;
}

$sql = "SELECT id, customer_name, total, created_at FROM orders WHERE id IN ($rawIds)";
$stmt = $pdo->query($sql);
$orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($orders);
```
