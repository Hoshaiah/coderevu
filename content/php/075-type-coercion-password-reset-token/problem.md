---
slug: type-coercion-password-reset-token
track: php
orderIndex: 75
title: Loose Comparison Bypasses Token Check
difficulty: easy
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

This is `password_reset.php`, the endpoint that validates a one-time token sent to a user's email. It queries the database for a pending reset request, pulls the stored token, and compares it with the value from the URL query string. The surrounding stack is a LAMP application running PHP 7.4.

Users have reported that pasting a reset link from their inbox fails intermittently, but QA also noticed something far worse: in testing, entering `0` as the token accepted any reset row whose token happened to start with a non-numeric character — effectively bypassing the check for a large class of tokens.

The developer reviewed the SQL query, verified parameterisation, and confirmed the token is generated with `bin2hex(random_bytes(16))` (all hex characters, no spaces). The database rows look correct. The bug is not in the query or in token generation — it is in how the comparison is performed.

## Buggy code

```php
<?php
// password_reset.php

require __DIR__ . '/db.php'; // provides $pdo

$token   = $_GET['token'] ?? '';
$user_id = (int) ($_GET['uid'] ?? 0);

$stmt = $pdo->prepare(
    "SELECT token FROM password_resets WHERE user_id = ? AND expires_at > NOW()"
);
$stmt->execute([$user_id]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    http_response_code(400);
    exit('Invalid or expired reset link.');
}

if ($row['token'] == $token) {
    // Token accepted — let user set a new password
    $_SESSION['reset_uid'] = $user_id;
    header('Location: /new_password.php');
    exit;
}

http_response_code(400);
echo 'Invalid token.';
```
