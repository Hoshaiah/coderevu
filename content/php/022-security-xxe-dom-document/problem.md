---
slug: security-xxe-dom-document
track: php
orderIndex: 22
title: DOMDocument Loads External Entities
difficulty: medium
tags:
  - security
  - xxe
  - xml
language: php
---

## Context

The file `integrations/invoice_importer.php` accepts XML invoice documents POSTed by partner systems. It is protected by IP allowlisting and HTTP Basic Auth, so the team has historically treated its input as trusted. It uses PHP's `DOMDocument` to parse the XML and extract invoice fields before inserting them into the database.

A new security audit flagged the endpoint. The auditor showed that even authenticated partners — or anyone who compromises a partner's credentials — can read arbitrary files from the server's filesystem by submitting a crafted XML payload. The team is not sure how this is possible given that the input comes from "trusted" partners.

## Buggy code

```php
<?php
// integrations/invoice_importer.php

header('Content-Type: application/json');

$xml_body = file_get_contents('php://input');
if (empty($xml_body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty body']);
    exit;
}

$doc = new DOMDocument();
$doc->loadXML($xml_body);

$invoice_id  = $doc->getElementsByTagName('invoice_id')->item(0)?->textContent ?? '';
$amount      = $doc->getElementsByTagName('amount')->item(0)?->textContent ?? '';
$vendor      = $doc->getElementsByTagName('vendor')->item(0)?->textContent ?? '';

echo json_encode([
    'status'     => 'imported',
    'invoice_id' => $invoice_id,
    'amount'     => $amount,
    'vendor'     => $vendor,
]);
```
