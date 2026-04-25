---
slug: unchecked-file-extension-upload
track: php
orderIndex: 16
title: >-
  Avatar upload endpoint checks only MIME type from the request, allowing PHP
  webshell upload
difficulty: medium
tags:
  - security
  - file-upload
  - rce
  - input-validation
language: php
---

## Context

A user-profile service lets members update their avatar. The endpoint saves the uploaded file into a publicly accessible web directory under `public/avatars/`. A red-team exercise showed it was possible to upload a `.php` file disguised with a correct `image/jpeg` Content-Type header, browse to its URL, and execute arbitrary server-side code.

## Buggy code

```php
<?php
// api/upload_avatar.php

session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    exit;
}

$userId  = (int) $_SESSION['user_id'];
$upload  = $_FILES['avatar'] ?? null;

if (!$upload || $upload['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'Upload failed']);
    exit;
}

$allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$clientMime  = $upload['type'];           // header sent by the browser

if (!in_array($clientMime, $allowedMime)) {
    http_response_code(415);
    echo json_encode(['error' => 'Unsupported image type']);
    exit;
}

$ext      = pathinfo($upload['name'], PATHINFO_EXTENSION);
$filename = "avatar_{$userId}.{$ext}";
$dest     = __DIR__ . '/../public/avatars/' . $filename;

move_uploaded_file($upload['tmp_name'], $dest);

echo json_encode(['url' => "/avatars/{$filename}"]);
```
