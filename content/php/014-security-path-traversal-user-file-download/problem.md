---
slug: security-path-traversal-user-file-download
track: php
orderIndex: 14
title: Path Traversal in File Download
difficulty: easy
tags:
  - security
  - path-traversal
  - file-handling
language: php
---

## Context

This script is `files/download.php`, part of a document-sharing feature that lets authenticated users download files they have uploaded. Each user's files are stored under `/var/app/uploads/{user_id}/`. The filename is passed as a query parameter so the download link can be bookmarked.

During an internal red-team exercise, a tester logged in as user 99 and requested `download.php?file=../../1/sensitive_contract.pdf`. The server responded with the contents of another user's file — a clear access-control bypass. By further extending the traversal, the tester read `/etc/passwd` and the application's `.env` file containing database credentials.

The access-control check (`file_exists` inside the user's own directory) was intended to be the safety net, but it was bypassed because `realpath` was never consulted to resolve the traversal sequences before the check.

## Buggy code

```php
<?php
// files/download.php

session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    exit('Unauthorized');
}

$userId   = (int) $_SESSION['user_id'];
$filename = $_GET['file'] ?? '';

if ($filename === '') {
    http_response_code(400);
    exit('Missing file parameter');
}

$userDir  = "/var/app/uploads/$userId";
$filePath = $userDir . '/' . $filename;

if (!file_exists($filePath)) {
    http_response_code(404);
    exit('File not found');
}

header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . basename($filename) . '"');
readfile($filePath);
```
