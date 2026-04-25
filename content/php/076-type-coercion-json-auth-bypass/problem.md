---
slug: type-coercion-json-auth-bypass
track: php
orderIndex: 76
title: JSON Type Coercion Auth Bypass
difficulty: easy
tags:
  - type-coercion
  - security
  - auth
  - api
language: php
---

## Context

This is a REST API endpoint at `api/v1/verify-pin.php` that validates a numeric PIN before granting access to a user's financial summary. The front-end sends JSON; the server decodes it with `json_decode()` and compares the submitted PIN against the one stored in the database. The endpoint has been in production for about a year serving a mobile banking app.

A security researcher reported that she can log in to any account by sending a crafted JSON payload without knowing the PIN at all. QA cannot reproduce the issue using the normal mobile client, but the researcher included a short `curl` command demonstrating a 200 response.

The engineering team already confirmed that the database query is fine and the PIN is stored correctly as a varchar. The bug is solely in how the comparison is performed after the value is retrieved.

## Buggy code

```php
<?php
// api/v1/verify-pin.php

header('Content-Type: application/json');

$conn = new PDO('mysql:host=localhost;dbname=banking', 'app', 'secret');

$body  = json_decode(file_get_contents('php://input'), true);
$token = $body['token'] ?? '';

// Validate bearer token, retrieve account
$stmt = $conn->prepare('SELECT id, pin FROM accounts WHERE session_token = ?');
$stmt->execute([$token]);
$account = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$account) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid token']);
    exit;
}

$submitted = $body['pin'] ?? null;

if ($submitted == $account['pin']) {
    echo json_encode(['status' => 'ok', 'balance' => '5,230.00']);
} else {
    http_response_code(403);
    echo json_encode(['error' => 'Wrong PIN']);
}
```
