---
slug: mass-assignment-user-update
track: php
orderIndex: 18
title: Unfiltered POST Fields Updated Blindly
difficulty: medium
tags:
  - security
  - mass-assignment
  - queries
language: php
---

## Context

This snippet lives in `api/account/update.php`, a JSON API endpoint that lets authenticated users update their own profile fields (display name, bio, timezone). The front-end sends only the fields the user edited. To avoid writing out every field individually, the developer built a helper that constructs a dynamic UPDATE statement from whatever keys are present in the JSON body.

During a routine audit the security engineer noticed that sending `{"role": "admin"}` or `{"credits": 99999}` in the request body caused those columns to be updated in the database. There was no whitelist of allowed fields — any column name that existed in the `users` table was silently accepted and written.

The developer argued the API is "authenticated so only real users call it." The auditor pointed out that a legitimate user escalating their own privileges or inflating their own credit balance is precisely the threat model for this endpoint.

## Buggy code

```php
<?php
// api/account/update.php

require __DIR__ . '/../../auth.php';   // sets $current_user_id or 401s
require __DIR__ . '/../../db.php';     // provides $pdo

header('Content-Type: application/json');

$body   = json_decode(file_get_contents('php://input'), true) ?? [];

if (empty($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'No fields provided']);
    exit;
}

// Build SET clause from whatever the client sends
$set_parts = [];
$params    = [];
foreach ($body as $col => $val) {
    $set_parts[] = "`$col` = ?";
    $params[]    = $val;
}

$params[] = $current_user_id;
$sql = "UPDATE users SET " . implode(', ', $set_parts) . " WHERE id = ?";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

echo json_encode(['ok' => true]);
```
