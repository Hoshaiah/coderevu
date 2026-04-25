---
slug: truncated-bcrypt-long-password
track: php
orderIndex: 25
title: Bcrypt Silently Truncates Long Passwords
difficulty: hard
tags:
  - security
  - type-coercion
  - auth
language: php
---

## Context

This is `auth/register.php`, the user registration handler for a SaaS application. It accepts a password from the sign-up form, validates its length client-side (minimum 8 characters, no maximum enforced by the UI), hashes it with `password_hash()` using `PASSWORD_BCRYPT`, and stores the hash. The companion `login.php` uses `password_verify()` symmetrically.

A security researcher reported that two users with completely different passwords — one being the first 72 characters of the other — could log in with either password. The support team initially dismissed it as a caching bug, but reproduction was consistent. The researcher noted the passwords differed only beyond the 72nd character.

The developer confirmed `password_hash` and `password_verify` were used correctly and saw no obvious bug. The issue is a well-known but subtle property of the bcrypt algorithm that PHP's `password_hash` does not paper over: bcrypt operates on at most 72 bytes of input and silently ignores everything beyond that.

## Buggy code

```php
<?php
// auth/register.php

require __DIR__ . '/../db.php'; // provides $pdo

$password = $_POST['password'] ?? '';

if (strlen($password) < 8) {
    http_response_code(422);
    echo json_encode(['error' => 'Password too short']);
    exit;
}

// Hash the password
$hash = password_hash($password, PASSWORD_BCRYPT);

$email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);
if (!$email) {
    http_response_code(422);
    echo json_encode(['error' => 'Invalid email']);
    exit;
}

$stmt = $pdo->prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
$stmt->execute([$email, $hash]);

http_response_code(201);
echo json_encode(['ok' => true]);
```
