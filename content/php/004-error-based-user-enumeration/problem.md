---
slug: error-based-user-enumeration
track: php
orderIndex: 4
title: >-
  Password reset endpoint reveals whether an email address is registered through
  distinct error messages
difficulty: easy
tags:
  - security
  - user-enumeration
  - information-disclosure
  - auth
language: php
---

## Context

A password reset flow sends a recovery link to the user's email address. The endpoint returns different HTTP responses and body messages depending on whether the submitted email exists in the database. An automated scanner flags this as a user-enumeration vulnerability — an attacker can compile a list of valid registered email addresses by probing the endpoint.

## Buggy code

```php
<?php
// auth/reset_request.php

header('Content-Type: application/json');

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', getenv('DB_PASSWORD'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$email = filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL);

if (!$email) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    http_response_code(404);
    echo json_encode(['error' => 'No account with that email address']);
    exit;
}

$token = bin2hex(random_bytes(32));
$expiry = date('Y-m-d H:i:s', strtotime('+1 hour'));

$pdo->prepare(
    'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)'
)->execute([$user['id'], hash('sha256', $token), $expiry]);

// Assume send_mail() is defined elsewhere.
send_mail($email, 'Password Reset', "Use this link: https://app.example.com/reset?token={$token}");

echo json_encode(['message' => 'Reset link sent']);
```
