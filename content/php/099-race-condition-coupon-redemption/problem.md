---
slug: race-condition-coupon-redemption
track: php
orderIndex: 99
title: >-
  Coupon redemption endpoint allows the same coupon to be used multiple times
  under concurrent load
difficulty: hard
tags:
  - concurrency
  - race-condition
  - database
  - toctou
language: php
---

## Context

A promotions service exposes a REST endpoint that validates and redeems single-use discount coupons. In load testing, the QA team discovered that hitting the endpoint twice in rapid succession with the same coupon code lets both requests succeed, effectively granting the discount twice. Revenue operations noticed the same pattern in production logs.

## Buggy code

```php
<?php
// api/redeem_coupon.php

header('Content-Type: application/json');

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', getenv('DB_PASSWORD'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$body  = json_decode(file_get_contents('php://input'), true);
$code  = trim($body['coupon_code'] ?? '');
$userId = (int) ($body['user_id'] ?? 0);

if (!$code || !$userId) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing parameters']);
    exit;
}

$stmt = $pdo->prepare('SELECT id, used FROM coupons WHERE code = ?');
$stmt->execute([$code]);
$coupon = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$coupon || $coupon['used']) {
    http_response_code(409);
    echo json_encode(['error' => 'Coupon invalid or already used']);
    exit;
}

// Mark as used and record who redeemed it.
$pdo->prepare('UPDATE coupons SET used = 1, redeemed_by = ? WHERE id = ?')
    ->execute([$userId, $coupon['id']]);

echo json_encode(['discount' => '20%', 'coupon_id' => $coupon['id']]);
```
