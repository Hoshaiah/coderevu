---
slug: type-coercion-loose-strcmp-token
track: php
orderIndex: 79
title: Loose Comparison on API Token
difficulty: easy
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

This is a webhook receiver at `api/webhook.php`. Third-party payment processors POST events to this endpoint, and a shared secret token in the `X-Webhook-Token` header is compared against a value stored in the database. The surrounding stack is a LAMP app with a legacy PHP 7.4 deployment.

Occasionally the security team gets alerts that webhook events are being accepted without a valid token. The logs show requests arriving with no `X-Webhook-Token` header at all, yet the handler processes them normally and updates order statuses. No middleware strips headers, and TLS termination has been ruled out as the cause.

A junior developer added the token check six months ago and believed it was solid because it uses `hash_equals` documentation as reference. The actual implementation drifted from that reference during a last-minute edit.

## Buggy code

```php
<?php
// api/webhook.php

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', 'secret');

$stmt = $pdo->query("SELECT value FROM settings WHERE name = 'webhook_secret' LIMIT 1");
$expected = $stmt->fetchColumn(); // returns a string like "abc123xyz"

$incoming = $_SERVER['HTTP_X_WEBHOOK_TOKEN'] ?? null;

if ($incoming == $expected) {
    $payload = json_decode(file_get_contents('php://input'), true);
    // process order update
    $orderId = (int) $payload['order_id'];
    $pdo->prepare("UPDATE orders SET status = ? WHERE id = ?")
        ->execute([$payload['status'], $orderId]);
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(403);
echo json_encode(['error' => 'forbidden']);
```
