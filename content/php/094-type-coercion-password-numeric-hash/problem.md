---
slug: type-coercion-password-numeric-hash
track: php
orderIndex: 94
title: Numeric String Password Bypass
difficulty: hard
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

This is `src/Api/V2/AuthController.php`, a REST API authentication endpoint used by a mobile app. Users log in with their email and a PIN (a 4–6 digit numeric code). The controller fetches the stored PIN hash and calls a helper to compare the submitted PIN against it.

QA reported that entering a PIN of `0` unlocks an account that has an entirely different PIN set. On inspection, the issue is reproducible for any account whose PIN hash begins with `0e` followed by digits — which happens to be true for about 1 in every 256 MD5 hash outputs due to the hex character distribution. The mobile team says roughly 0.4% of user accounts are silently vulnerable.

The security team confirmed this is not a brute-force or timing issue. The PIN is submitted as a JSON integer in the request body, and the bug is in how PHP compares the hash strings.

## Buggy code

```php
<?php
// src/Api/V2/AuthController.php

class AuthController
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function login(array $body): array
    {
        $email = $body['email'] ?? '';
        $pin   = $body['pin']   ?? '';

        $stmt = $this->pdo->prepare(
            "SELECT id, pin_hash FROM users WHERE email = ?"
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return ['success' => false, 'error' => 'Invalid credentials'];
        }

        $submitted = md5((string) $pin);

        if ($submitted == $user['pin_hash']) {
            return ['success' => true, 'user_id' => $user['id']];
        }

        return ['success' => false, 'error' => 'Invalid credentials'];
    }
}
```
