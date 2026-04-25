---
slug: security-timing-safe-token-compare
track: php
orderIndex: 21
title: Timing-Unsafe API Token Compare
difficulty: medium
tags:
  - security
  - timing-attack
  - auth
  - api
language: php
---

## Context

This is `src/Middleware/ApiTokenMiddleware.php`, a PSR-15 middleware that authenticates inbound webhook requests from third-party payment providers. Each provider is configured with a shared secret token stored in the database. The middleware extracts the `X-Api-Token` header and compares it to the stored secret.

A security researcher submitted a responsible disclosure noting that the token comparison is vulnerable to a remote timing attack. With enough samples (several thousand requests), an attacker can statistically distinguish a correct first byte from an incorrect one, then enumerate the token one byte at a time — the classic timing oracle. The application is accessible over the public internet with no rate limiting on the webhook endpoint.

The team is confused because the comparison was written as a simple `===` strict equality check, which they believed was safe. The explanation is that PHP's `===` on strings short-circuits as soon as it finds the first differing byte.

## Buggy code

```php
<?php
// src/Middleware/ApiTokenMiddleware.php

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

class ApiTokenMiddleware implements MiddlewareInterface
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function process(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        $token = $request->getHeaderLine('X-Api-Token');
        $source = $request->getHeaderLine('X-Source');

        $stmt = $this->pdo->prepare(
            "SELECT token FROM api_credentials WHERE source = ?"
        );
        $stmt->execute([$source]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || $token !== $row['token']) {
            return new Response(401, [], 'Unauthorized');
        }

        return $handler->handle($request);
    }
}
```
