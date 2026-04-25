---
slug: security-shell-injection-imagemagick
track: php
orderIndex: 11
title: Shell Injection via Filename
difficulty: easy
tags:
  - security
  - shell-injection
  - file-upload
language: php
---

## Context

This snippet lives in `upload/resize.php`, part of a product-image pipeline for a small e-commerce site. When a seller uploads a JPEG, the script resizes it to a thumbnail using ImageMagick via `shell_exec`. The admin insisted on preserving original filenames so sellers can recognise their uploads in the media library.

Customer support has noticed that occasionally a file upload appears to succeed but no thumbnail appears in the media library. One seller reported a file named `product; rm -rf /var/www/html/uploads;.jpg` caused the uploads directory to go empty overnight. The DevOps engineer initially blamed a cron job.

The server is running PHP 8.1 with `shell_exec` enabled and ImageMagick 7 installed. No WAF or filename sanitisation exists upstream of this script.

## Buggy code

```php
<?php
// upload/resize.php

$uploadDir = '/var/www/html/uploads/';
$thumbDir  = '/var/www/html/uploads/thumbs/';

if ($_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    exit('Upload error');
}

$originalName = basename($_FILES['image']['name']);
$destination  = $uploadDir . $originalName;

move_uploaded_file($_FILES['image']['tmp_name'], $destination);

$thumb = $thumbDir . $originalName;
$cmd   = "convert $destination -resize 200x200 $thumb";
$output = shell_exec($cmd);

echo json_encode(['thumb' => '/uploads/thumbs/' . $originalName]);
```
