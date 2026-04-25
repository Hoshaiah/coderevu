---
slug: type-coercion-loose-zero-strcmp
track: php
orderIndex: 80
title: Loose Comparison Bypasses API Key
difficulty: easy
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

This middleware lives in `api/middleware/auth.php` and gates every internal webhook endpoint. External services POST events and must supply an `X-Api-Key` header. The key is a 40-character hex string stored in a `.env` file and loaded via `$_ENV`.

QA noticed that sending a request with the header value `0` causes the middleware to pass authentication and forward the request to the handler. The production on-call engineer tried a few random strings and they were rejected as expected, so the issue was closed as a test environment fluke. It is not a fluke.

## Buggy code

```php
<?php
// api/middleware/auth.php

function authenticate_webhook(): void
{
    $expected = $_ENV['WEBHOOK_API_KEY'] ?? '';
    $provided = $_SERVER['HTTP_X_API_KEY'] ?? '';

    if ($expected == $provided) {
        return; // authenticated
    }

    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

authenticate_webhook();
```
