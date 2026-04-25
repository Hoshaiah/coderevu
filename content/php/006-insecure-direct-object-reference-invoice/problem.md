---
slug: insecure-direct-object-reference-invoice
track: php
orderIndex: 6
title: Missing Ownership Check on Invoice Download
difficulty: easy
tags:
  - security
  - authorization
  - queries
language: php
---

## Context

This is `invoices/download.php`, a file that serves PDF invoices to authenticated customers. The invoice ID is taken from the URL, the matching row is fetched from the database, and the PDF file is streamed back. Authentication is enforced: only logged-in users reach this endpoint. The surrounding framework sets `$_SESSION['user_id']` after login.

A customer support ticket arrived describing a user who discovered they could download other customers' invoices by incrementing the `id` parameter in the URL. The IDs are sequential integers starting at 1, so enumerating the entire invoice archive requires nothing more than a simple loop.

The developer reviewed the code and confirmed authentication is working — the `/invoices/download.php` route is unreachable without a session. They missed that authentication ("are you logged in?") and authorisation ("do you own this resource?") are two separate checks.

## Buggy code

```php
<?php
// invoices/download.php

require __DIR__ . '/../session.php'; // asserts $_SESSION['user_id'] exists
require __DIR__ . '/../db.php';      // provides $pdo

$invoice_id = (int) ($_GET['id'] ?? 0);

if ($invoice_id <= 0) {
    http_response_code(400);
    exit('Invalid invoice ID.');
}

$stmt = $pdo->prepare(
    "SELECT file_path, filename FROM invoices WHERE id = ?"
);
$stmt->execute([$invoice_id]);
$invoice = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$invoice) {
    http_response_code(404);
    exit('Invoice not found.');
}

$path = __DIR__ . '/../storage/' . $invoice['file_path'];

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $invoice['filename'] . '"');
readfile($path);
```
