---
slug: security-xxe-simplexml
track: php
orderIndex: 29
title: XXE via SimpleXML Product Import
difficulty: hard
tags:
  - security
  - xxe
  - xml
language: php
---

## Context

A supplier integration endpoint at `import/products_xml.php` accepts XML product feeds uploaded by authenticated supplier accounts. Suppliers upload files through a web form; the XML is parsed immediately to preview the products before a confirm-and-save step. The app runs PHP 8.0 with libxml2 bundled at the default version shipped with the OS.

During an internal red-team exercise, a tester uploaded a crafted XML file and received the contents of `/etc/passwd` in the product preview response. The tester had a valid supplier account. The finding was marked P1 because the app server has IAM credentials in environment variables and in `~/.aws/credentials`, making the file-read vector equivalent to cloud account takeover.

The developer who wrote the importer was aware of SQL injection and XSS but had not encountered XXE before. They noted that the file is "just XML we parse ourselves" and assumed parsing a file is safe as long as you don't eval it.

## Buggy code

```php
<?php
// import/products_xml.php

if (empty($_SESSION['supplier_id'])) {
    http_response_code(403);
    exit;
}

$upload = $_FILES['feed'] ?? null;
if (!$upload || $upload['error'] !== UPLOAD_ERR_OK) {
    exit('Upload failed');
}

$xml_string = file_get_contents($upload['tmp_name']);
$xml = simplexml_load_string($xml_string);

if ($xml === false) {
    exit('Invalid XML');
}

$products = [];
foreach ($xml->product as $p) {
    $products[] = [
        'sku'   => (string) $p->sku,
        'name'  => (string) $p->name,
        'price' => (float)  $p->price,
    ];
}

echo json_encode(['preview' => $products]);
```
