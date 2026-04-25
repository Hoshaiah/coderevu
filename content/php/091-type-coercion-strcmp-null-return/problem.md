---
slug: type-coercion-strcmp-null-return
track: php
orderIndex: 91
title: strcmp Returns Null on Array Input
difficulty: medium
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

This function lives in `src/Auth/TokenValidator.php`, part of a home-grown authentication library used by several internal microservices. It compares a caller-supplied API token against the one stored in the environment. The function is called in a middleware layer before every protected endpoint.

During a security audit the tester found they could bypass token validation entirely by sending the `X-Api-Token` header value as an array (e.g., `X-Api-Token[]=anything`). PHP's `$_SERVER` population from `getallheaders()` normally returns strings, but the service also accepts JSON bodies where the token field can be any JSON type — and `$_POST['token']` is used as a fallback when the header is absent.

The symptom is silent: no error is logged, no exception is thrown, and the middleware passes the request through as if the token were valid.

## Buggy code

```php
<?php
// src/Auth/TokenValidator.php

class TokenValidator
{
    private string $expectedToken;

    public function __construct()
    {
        $this->expectedToken = (string) getenv('API_SECRET_TOKEN');
    }

    public function validate(mixed $suppliedToken): bool
    {
        if (empty($suppliedToken)) {
            return false;
        }

        // Use strcmp for timing-safe-ish comparison
        if (strcmp($suppliedToken, $this->expectedToken) === 0) {
            return true;
        }

        return false;
    }
}
```
