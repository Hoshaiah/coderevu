---
slug: type-coercion-json-numeric-id-bypass
track: php
orderIndex: 87
title: Numeric JSON ID Loose Comparison
difficulty: medium
tags:
  - type-coercion
  - security
  - authorization
language: php
---

## Context

This middleware in `src/Middleware/OwnershipCheck.php` protects a REST API endpoint that lets users update their own profile data. The client sends a JSON body; the middleware extracts the `user_id` from the decoded body and compares it to the authenticated user's ID stored in the session to ensure users cannot modify other accounts.

A penetration tester demonstrated that sending `{"user_id": true}` in the request body bypassed the ownership check and allowed updating any user's profile. The developer was confused because the comparison looked like it should work.

The app runs on PHP 8.1 and the session stores `user_id` as an integer loaded directly from the database.

## Buggy code

```php
<?php
// src/Middleware/OwnershipCheck.php

class OwnershipCheck
{
    public function handle(array $sessionData, string $rawBody): bool
    {
        $body   = json_decode($rawBody, true);
        $bodyId = $body['user_id'] ?? null;

        $sessionUserId = $sessionData['user_id'] ?? null;

        if ($bodyId != $sessionUserId) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }

        return true;
    }
}
```
