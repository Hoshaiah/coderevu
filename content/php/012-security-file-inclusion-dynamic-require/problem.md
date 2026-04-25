---
slug: security-file-inclusion-dynamic-require
track: php
orderIndex: 12
title: Dynamic require_once Allows File Inclusion
difficulty: easy
tags:
  - security
  - file-inclusion
  - path-traversal
language: php
---

## Context

This dispatcher is in `public/index.php` and routes page requests by mapping a `page` query parameter to PHP files inside the `pages/` directory. The application predates a proper routing framework and this file-based dispatch was the original architecture. The `pages/` directory contains files like `home.php`, `about.php`, and `contact.php`.

A penetration tester submitted a report showing they were able to read `/etc/passwd` by requesting `/?page=../../../etc/passwd%00` on PHP 5.x and `/?page=../../../../var/log/apache2/access.log` on PHP 7.x, achieving log-poisoning remote code execution. On the PHP 7 production server, the null-byte truncation trick does not work, but relative path traversal still reads arbitrary files whose names end in `.php`, and log files that contain PHP code are executable.

The team added `basename()` previously to strip path components, but the fix was applied incorrectly.

## Buggy code

```php
<?php
// public/index.php

$page = $_GET['page'] ?? 'home';

// Attempt to prevent path traversal — strip directory separators
$page = str_replace(['../', '..\\'], '', $page);

$file = __DIR__ . '/../pages/' . $page . '.php';

if (!file_exists($file)) {
    $file = __DIR__ . '/../pages/404.php';
}

require_once $file;
```
