---
slug: security-object-injection-unserialize-param
track: php
orderIndex: 13
title: Unserialize on URL Parameter Input
difficulty: easy
tags:
  - security
  - deserialization
  - object-injection
language: php
---

## Context

This file lives at `api/preview.php` in a PHP 7.4 e-commerce backend. It is called by a JavaScript front-end to reconstruct a shopping-cart preview from a previously serialised string stored in the browser's `localStorage` and passed back as a query parameter.

Customers started reporting that visiting certain shared URLs caused files to be created or modified on the server. The ops team found unexpected PHP files appearing under `/tmp/` and in the web root, but couldn't trace the cause through the normal request logs because the requests looked like ordinary GET calls to `/api/preview.php`.

The database, session store, and third-party integrations were all ruled out. A junior engineer noticed the URL contained a `cart` parameter that looked like a serialised PHP object but thought it was harmless because 'it's just data'.

## Buggy code

```php
<?php
// api/preview.php

header('Content-Type: application/json');

require_once __DIR__ . '/../vendor/autoload.php';

$cartData = $_GET['cart'] ?? '';

if ($cartData === '') {
    echo json_encode(['items' => []]);
    exit;
}

$cart = unserialize(base64_decode($cartData));

if (!is_array($cart)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid cart']);
    exit;
}

$total = 0;
$preview = [];
foreach ($cart as $item) {
    $preview[] = [
        'name'  => htmlspecialchars($item['name']),
        'qty'   => (int) $item['qty'],
        'price' => (float) $item['price'],
    ];
    $total += $item['qty'] * $item['price'];
}

echo json_encode(['items' => $preview, 'total' => $total]);
```
