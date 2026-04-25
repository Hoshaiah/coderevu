---
slug: header-injection-filename
track: php
orderIndex: 28
title: Header Injection via Filename
difficulty: hard
tags:
  - security
  - header-injection
  - http
language: php
---

## Context

The controller in `src/Reports/DownloadController.php` generates a PDF report on the fly and sends it to the browser with a `Content-Disposition` header that includes the report name as the filename. The report name is provided by the user when they schedule the report and is stored in the `reports` table as a free-text string. There is no length or character validation on the report name field.

A security researcher demonstrated that by naming a report `monthly\r\nSet-Cookie: session=attacker_value` they could inject an arbitrary HTTP response header into every download response for that report. The researcher showed that another user could be tricked into downloading the report (via a shared link), causing their browser to overwrite a cookie or accept a forged header.

The team confirmed that PDO is used correctly for the database query, so SQL injection is not a factor. The only issue is in how the fetched report name is placed into the HTTP header.

## Buggy code

```php
<?php
// src/Reports/DownloadController.php

require_once __DIR__ . '/../../bootstrap.php';

session_start();

$user_id = $_SESSION['user_id'] ?? null;
if (!$user_id) {
    http_response_code(401);
    exit;
}

$report_id = (int) ($_GET['report_id'] ?? 0);

$pdo  = get_db_connection();
$stmt = $pdo->prepare(
    "SELECT name, file_path FROM reports WHERE id = ? AND user_id = ?"
);
$stmt->execute([$report_id, $user_id]);
$report = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$report) {
    http_response_code(404);
    echo 'Report not found';
    exit;
}

$report_name = $report['name'];
$file_path   = $report['file_path'];

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $report_name . '"');

readfile($file_path);
exit;
```
