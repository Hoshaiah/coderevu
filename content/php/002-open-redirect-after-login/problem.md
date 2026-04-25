---
slug: open-redirect-after-login
track: php
orderIndex: 2
title: >-
  Post-login redirect uses an unvalidated `next` query parameter, enabling
  phishing redirects
difficulty: easy
tags:
  - security
  - open-redirect
  - auth
  - input-validation
language: php
---

## Context

A SaaS application redirects users back to the page they were trying to visit after they log in, using a `next` query parameter passed through the login form. The security team received a phishing report where an attacker sent a link like `/login?next=https://evil.example.com` — after successful login, the victim was silently sent to the attacker's site.

## Buggy code

```php
<?php
// auth/login_post.php

session_start();

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', getenv('DB_PASSWORD'));

$email    = $_POST['email']    ?? '';
$password = $_POST['password'] ?? '';
$next     = $_GET['next']      ?? '/dashboard';

$stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    header('Location: /login?error=1');
    exit;
}

session_regenerate_id(true);
$_SESSION['user_id'] = $user['id'];

header('Location: ' . $next);
exit;
```
