---
slug: type-coercion-strcmp-bypass
track: php
orderIndex: 78
title: strcmp() Returns Zero on Array
difficulty: easy
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

This snippet lives in `api/v1/auth/verify_token.php`, a lightweight endpoint that validates a one-time API token before allowing access to bulk export functionality. The token is read from a custom HTTP header and compared against a value stored in a MySQL row. The stack is PHP 7.4 on nginx, with tokens written by a separate provisioning service.

Users started reporting that the export endpoint occasionally returns data without a valid token. QA can reproduce it 100% of the time when they send a specific malformed request. The access log shows 200s where 401s are expected.

A colleague already ruled out caching (no reverse proxy is in front of this endpoint) and confirmed the database row contains the correct token string. The bug is entirely in this file.

## Buggy code

```php
<?php
// api/v1/auth/verify_token.php

require_once __DIR__ . '/../../bootstrap.php';

$pdo = get_db_connection();

$header_token = $_SERVER['HTTP_X_API_TOKEN'] ?? '';

$stmt = $pdo->prepare("SELECT token FROM api_tokens WHERE active = 1 LIMIT 1");
$stmt->execute();
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    http_response_code(401);
    echo json_encode(['error' => 'No active token found']);
    exit;
}

if (strcmp($header_token, $row['token']) !== 0) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid token']);
    exit;
}

// Token is valid — proceed
http_response_code(200);
echo json_encode(['status' => 'authorized']);
exit;
```
