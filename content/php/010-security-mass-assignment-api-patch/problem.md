---
slug: security-mass-assignment-api-patch
track: php
orderIndex: 10
title: PATCH Endpoint Allows Role Assignment
difficulty: easy
tags:
  - security
  - mass-assignment
  - authorization
language: php
---

## Context

The REST API endpoint in `api/users/update.php` allows authenticated users to update their own profile fields — display name, bio, and avatar URL. It accepts a JSON body and builds an `UPDATE` query using whichever keys the client provides, intended as a convenience so clients do not have to submit unchanged fields.

A bug bounty researcher reported that by including `"role": "admin"` or `"credits": 99999` in the PATCH body, any user can promote themselves to admin or credit their own account. The developer who wrote the endpoint assumed that ordinary users would not know to send those fields.

## Buggy code

```php
<?php
// api/users/update.php

session_start();
header('Content-Type: application/json');

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthenticated']);
    exit;
}

$pdo  = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$body = json_decode(file_get_contents('php://input'), true) ?? [];

if (empty($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty body']);
    exit;
}

// Build SET clause dynamically from supplied fields
$set_parts = [];
$params    = [];
foreach ($body as $column => $value) {
    $set_parts[] = "`{$column}` = ?";
    $params[]    = $value;
}
$params[] = $_SESSION['user_id'];

$sql  = 'UPDATE users SET ' . implode(', ', $set_parts) . ' WHERE id = ?';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

echo json_encode(['status' => 'updated']);
```
