---
slug: type-coercion-switch-loose-match
track: php
orderIndex: 84
title: Loose Switch Matches Zero Status
difficulty: medium
tags:
  - type-coercion
  - correctness
  - api
language: php
---

## Context

The file `api/webhooks/payment_callback.php` receives POST callbacks from a payment gateway and updates the internal order status based on the `payment_status` field in the JSON body. The gateway sends status values as strings: `"success"`, `"failed"`, `"pending"`. Internally the application maps these to integer status codes in the `orders` table: `1` for success, `2` for failed, `3` for pending.

Finance noticed that a small number of orders are being marked as succeeded when the gateway's callback clearly shows `"failed"`. Capturing the raw JSON confirms the gateway is sending the correct string, and the database write is going to the right column. The issue is in the status-mapping logic itself.

A developer added `var_dump($payment_status)` and confirmed the value is the string `"failed"` at the top of the function. By the time the order update executes, the status code written is `1` (success) rather than `2` (failed).

## Buggy code

```php
<?php
// api/webhooks/payment_callback.php

require_once __DIR__ . '/../../bootstrap.php';

$body = json_decode(file_get_contents('php://input'), true);

$order_id      = (int) ($body['order_id'] ?? 0);
$payment_status = $body['payment_status'] ?? '';

function map_status(string $payment_status): int
{
    switch ($payment_status) {
        case 0:
            return 3; // pending — unreachable intentional default
        case 'success':
            return 1;
        case 'failed':
            return 2;
        default:
            return 0;
    }
}

$internal_status = map_status($payment_status);

if ($internal_status === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown payment status']);
    exit;
}

$pdo  = get_db_connection();
$stmt = $pdo->prepare("UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?");
$stmt->execute([$internal_status, $order_id]);

http_response_code(200);
echo json_encode(['ok' => true]);
exit;
```
