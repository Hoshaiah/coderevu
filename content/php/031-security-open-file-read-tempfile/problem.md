---
slug: security-open-file-read-tempfile
track: php
orderIndex: 31
title: Temp File Path Disclosed to Client
difficulty: hard
tags:
  - security
  - information-disclosure
  - file-handling
language: php
---

## Context

The endpoint `export/generate.php` produces a CSV export of filtered sales data and is used by finance team members. It writes the CSV to a temporary file, then sets the appropriate headers and streams the file to the browser. The server is Linux with PHP 8.2 and the web root is `/var/www/html`.

The security team found that an error response from this endpoint sometimes contains the full server-side path of the temporary file, e.g. `Error: failed to open /tmp/phpA3f9Bk`. On Linux, `/tmp` is world-readable by default; an attacker with local shell access (or another RCE) could read the file before it is deleted. More critically, if `display_errors` is `On` in production, any subsequent PHP error leaks the path in a browser-visible error message.

The secondary issue flagged was that if the query returns no rows the script still sends a 200 response with an empty body rather than a helpful error, confusing the frontend.

## Buggy code

```php
<?php
// export/generate.php

session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    exit('Unauthorised');
}

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$from = $_GET['from'] ?? date('Y-m-01');
$to   = $_GET['to']   ?? date('Y-m-t');

$stmt = $pdo->prepare(
    'SELECT order_id, amount, created_at FROM orders
     WHERE created_at BETWEEN ? AND ?'
);
$stmt->execute([$from, $to]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$tmpPath = tempnam(sys_get_temp_dir(), 'export_');
$fh = fopen($tmpPath, 'w');
fwrite($fh, "order_id,amount,created_at\n");
foreach ($rows as $row) {
    fwrite($fh, implode(',', $row) . "\n");
}
fclose($fh);

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="sales_export.csv"');
readfile($tmpPath);
unlink($tmpPath);
```
