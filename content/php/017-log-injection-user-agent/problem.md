---
slug: log-injection-user-agent
track: php
orderIndex: 17
title: >-
  Request logger writes raw User-Agent header into log file, enabling log
  injection
difficulty: medium
tags:
  - security
  - log-injection
  - input-validation
  - logging
language: php
---

## Context

A middleware script logs each incoming API request to a flat text file for audit purposes. A penetration tester showed that crafting a `User-Agent` containing a newline followed by a fake log line allowed them to forge audit records, making it look as if other users had taken actions they had not — relevant for a system under financial regulatory compliance.

## Buggy code

```php
<?php
// middleware/request_logger.php

function log_request(int $userId): void
{
    $ip        = $_SERVER['REMOTE_ADDR']       ?? 'unknown';
    $method    = $_SERVER['REQUEST_METHOD']    ?? 'UNKNOWN';
    $uri       = $_SERVER['REQUEST_URI']       ?? '/';
    $userAgent = $_SERVER['HTTP_USER_AGENT']   ?? '';
    $timestamp = date('Y-m-d H:i:s');

    $line = "[{$timestamp}] user={$userId} ip={$ip} method={$method} uri={$uri} ua={$userAgent}";

    file_put_contents(
        '/var/log/app/requests.log',
        $line . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}
```
