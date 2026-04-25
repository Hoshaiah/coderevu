---
slug: insecure-password-reset-timing
track: php
orderIndex: 27
title: Timing Oracle in Password Reset
difficulty: hard
tags:
  - security
  - timing-attack
  - auth
  - enumeration
language: php
---

## Context

The file `auth/reset-password.php` handles the second step of a password reset: the user arrives via an emailed link containing their email address and a one-time token. The page validates both, and if they match, shows the new-password form. The function is also called via AJAX to give instant feedback on whether a token URL is still valid before the user fills in the form.

A security researcher reported that she can enumerate valid email addresses registered in the system by timing the response: requests for registered-but-invalid-token emails take measurably longer than requests for unregistered emails. At scale (thousands of requests) the timing difference — about 40 ms on average — is statistically reliable enough to build a list of registered accounts.

The team confirmed the endpoint uses HTTPS, has rate limiting at the load balancer (50 req/min per IP), and does not return different HTTP status codes or body text for the two cases. The only signal is response time.

## Buggy code

```php
<?php
// auth/reset-password.php

header('Content-Type: application/json');

$conn = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$email = strtolower(trim($_POST['email'] ?? ''));
$token = trim($_POST['token'] ?? '');

// Look up user by email first
$stmt = $conn->prepare(
    'SELECT id, reset_token, reset_expires FROM users WHERE email = ?'
);
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    // No such email — return generic error immediately
    echo json_encode(['valid' => false]);
    exit;
}

// Email exists — now validate the token
if (
    $user['reset_token'] === null ||
    !hash_equals($user['reset_token'], $token) ||
    strtotime($user['reset_token_expires']) < time()
) {
    echo json_encode(['valid' => false]);
    exit;
}

echo json_encode(['valid' => true]);
```
