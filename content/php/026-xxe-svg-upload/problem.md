---
slug: xxe-svg-upload
track: php
orderIndex: 26
title: XXE via SVG Upload
difficulty: hard
tags:
  - security
  - xxe
  - file-upload
  - xml
language: php
---

## Context

The endpoint `api/avatars/upload.php` accepts avatar image uploads from authenticated users. To support SVG avatars (popular with developers who want crisp icons at any size), the code detects the MIME type from the file's magic bytes and, for SVGs specifically, uses PHP's `DOMDocument` to parse and re-serialise the XML so it can strip unsafe tags like `<script>`. The sanitised SVG is then stored in S3 and its URL is written to the user's profile.

A security researcher filed a critical report: by submitting a carefully crafted SVG, she was able to read the contents of `/etc/passwd` and, on the staging server, the application's `.env` file containing database credentials. No alarm was triggered because the upload itself succeeded and returned a 200 response with a valid avatar URL.

The team hardened the MIME-type check and confirmed that only `.svg` files reach the XML parsing path. The XXE vulnerability is in how `DOMDocument` is configured before parsing.

## Buggy code

```php
<?php
// api/avatars/upload.php

session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401); exit;
}

$file    = $_FILES['avatar'];
$tmpPath = $file['tmp_name'];
$mime    = mime_content_type($tmpPath);

if (!in_array($mime, ['image/png', 'image/jpeg', 'image/svg+xml'], true)) {
    http_response_code(415);
    echo json_encode(['error' => 'Unsupported type']);
    exit;
}

if ($mime === 'image/svg+xml') {
    $raw = file_get_contents($tmpPath);

    $dom = new DOMDocument();
    $dom->loadXML($raw);

    // Remove script tags
    foreach ($dom->getElementsByTagName('script') as $node) {
        $node->parentNode->removeChild($node);
    }

    $sanitised = $dom->saveXML();
    // ... upload $sanitised to S3 ...
} else {
    // ... upload raw file to S3 ...
}

echo json_encode(['status' => 'ok']);
```
