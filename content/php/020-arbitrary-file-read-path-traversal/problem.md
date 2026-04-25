---
slug: arbitrary-file-read-path-traversal
track: php
orderIndex: 20
title: Path Traversal in File Download
difficulty: medium
tags:
  - security
  - path-traversal
  - file-access
language: php
---

## Context

The endpoint `public/downloads/serve.php` lets authenticated users download their own exported report files. Reports are generated as CSV files and stored under `/var/app/exports/{user_id}/`. The filename is passed as a GET parameter because the download is triggered from an email link. Authentication is enforced by checking `$_SESSION['user_id']` before serving any file.

A security researcher submitted a report demonstrating they could read `/etc/passwd` and the application's `bootstrap.php` (which contains database credentials) by manipulating the `file` parameter. The session check is working correctly — the researcher was legitimately logged in — but the file they received was not one they generated.

The team had assumed that prepending the user-specific directory would confine access, but did not account for relative path components in the filename.

## Buggy code

```php
<?php
// public/downloads/serve.php

require_once __DIR__ . '/../../bootstrap.php';

session_start();

$user_id = $_SESSION['user_id'] ?? null;
if (!$user_id) {
    http_response_code(401);
    echo 'Unauthorized';
    exit;
}

$filename = $_GET['file'] ?? '';
if ($filename === '') {
    http_response_code(400);
    echo 'Missing file parameter';
    exit;
}

$base_dir  = '/var/app/exports/' . $user_id . '/';
$full_path = $base_dir . $filename;

if (!file_exists($full_path)) {
    http_response_code(404);
    echo 'File not found';
    exit;
}

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="' . basename($filename) . '"');
readfile($full_path);
exit;
```
