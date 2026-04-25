---
slug: xxe-file-upload-parser
track: php
orderIndex: 15
title: >-
  XML order importer processes uploaded files without disabling external
  entities
difficulty: medium
tags:
  - security
  - xxe
  - xml
  - file-upload
language: php
---

## Context

An e-commerce back-office tool lets warehouse staff upload purchase-order XML files exported from their ERP. The endpoint parses the file and inserts rows into a `purchase_orders` table. A security audit flagged this endpoint — the auditor was able to read `/etc/passwd` from the server by uploading a crafted XML file.

## Buggy code

```php
<?php
// warehouse/import_orders.php

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$tmpPath = $_FILES['order_xml']['tmp_name'];
if (!$tmpPath || !is_uploaded_file($tmpPath)) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded']);
    exit;
}

$xmlContent = file_get_contents($tmpPath);
$xml = simplexml_load_string($xmlContent);

if ($xml === false) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid XML']);
    exit;
}

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', getenv('DB_PASSWORD'));

foreach ($xml->order as $order) {
    $stmt = $pdo->prepare(
        'INSERT INTO purchase_orders (supplier, sku, qty) VALUES (?, ?, ?)'
    );
    $stmt->execute([
        (string) $order->supplier,
        (string) $order->sku,
        (int)    $order->qty,
    ]);
}

echo json_encode(['imported' => $xml->order->count()]);
```
