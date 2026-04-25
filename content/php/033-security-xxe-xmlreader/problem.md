---
slug: security-xxe-xmlreader
track: php
orderIndex: 33
title: XMLReader Parses Untrusted External Entities
difficulty: hard
tags:
  - security
  - xxe
  - xml
  - file-read
language: php
---

## Context

This endpoint lives in `api/ImportOrders.php` and accepts XML order files uploaded by integration partners. Partners POST an XML document to the endpoint, which is parsed and inserted into the `orders` table. The `XMLReader` class was chosen over `SimpleXML` by the previous team for its streaming capability when handling large files.

A partner submitted a support ticket claiming their import returned unexpected data. The operations team investigated and found the import response contained fragments of `/etc/passwd` embedded in order field values. The security team escalated it immediately. No partners have been granted shell access to the server.

The engineer on call confirmed the file size limit and MIME type check are working. The malicious payload was a valid XML file that passed all pre-parsing validation. The vulnerability is triggered during the parsing step itself.

## Buggy code

```php
<?php
// api/ImportOrders.php

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

$xmlContent = file_get_contents('php://input');

$reader = new XMLReader();
$reader->XML($xmlContent);

$orders = [];
while ($reader->read()) {
    if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'order') {
        $node = $reader->expand();
        $orders[] = [
            'ref'    => $node->getElementsByTagName('ref')->item(0)->textContent,
            'amount' => $node->getElementsByTagName('amount')->item(0)->textContent,
        ];
    }
}
$reader->close();

echo json_encode(['imported' => count($orders)]);
```
