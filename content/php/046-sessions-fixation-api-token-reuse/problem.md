---
slug: sessions-fixation-api-token-reuse
track: php
orderIndex: 46
title: API Token Never Rotated on Login
difficulty: medium
tags:
  - sessions
  - security
  - auth
language: php
---

## Context

The file `api/login.php` is the authentication endpoint for a mobile app. Rather than cookies, it issues a bearer token stored in the `api_tokens` table with a `user_id` and `token` column. The token is generated once when a user first registers and is intended to rotate on every login for security.

The security team observed during a penetration test that logging in does not change the token. An attacker who obtained an old token — from a phishing page, a leaked log file, or a compromised device — can continue using it indefinitely even after the legitimate user logs back in and "resets" their session.

The developer argued that tokens are long random strings and therefore unguessable. The penetration tester demonstrated that the token from a six-month-old log file was still valid after multiple logins.

## Buggy code

```php
<?php
// api/login.php

header('Content-Type: application/json');

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$body = json_decode(file_get_contents('php://input'), true);
$email    = $body['email']    ?? '';
$password = $body['password'] ?? '';

$stmt = $pdo->prepare('SELECT id, password_hash, FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
    exit;
}

// Return the existing token — no rotation
$stmt = $pdo->prepare('SELECT token FROM api_tokens WHERE user_id = ?');
$stmt->execute([$user['id']]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

echo json_encode(['token' => $row['token']]);
```
