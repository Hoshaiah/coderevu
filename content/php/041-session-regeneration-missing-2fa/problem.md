---
slug: session-regeneration-missing-2fa
track: php
orderIndex: 41
title: Missing Session Regeneration After 2FA
difficulty: medium
tags:
  - sessions
  - security
  - auth
  - 2fa
language: php
---

## Context

The two-factor authentication flow spans two files: `auth/login.php` sets a `$_SESSION['pending_2fa_user_id']` after validating the password, and `auth/verify-totp.php` (below) checks the TOTP code, promotes the session to fully authenticated, and redirects to the dashboard. The application uses PHP file-based sessions.

A security review identified a session fixation risk in the TOTP verification step. An attacker who can set a victim's session cookie (via a subdomain, a shared network, or a prior XSS) can plant a session ID before the victim logs in. After the victim completes both the password step and the TOTP step, the attacker's pre-planted session ID now has full authenticated access — without the attacker ever knowing the password or TOTP code.

The developer argued that `session_regenerate_id()` is called in `login.php` after the password check. The reviewer pointed out that a second regeneration must also happen at the final privilege-elevation point: the completion of 2FA.

## Buggy code

```php
<?php
// auth/verify-totp.php

session_start();

if (empty($_SESSION['pending_2fa_user_id'])) {
    header('Location: /auth/login.php');
    exit;
}

require_once __DIR__ . '/../lib/totp.php';

$userId = (int) $_SESSION['pending_2fa_user_id'];
$code   = trim($_POST['code'] ?? '');

$conn = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$stmt = $conn->prepare('SELECT totp_secret FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !totp_verify($user['totp_secret'], $code)) {
    $_SESSION['totp_error'] = 'Invalid code';
    header('Location: /auth/verify-totp.php');
    exit;
}

unset($_SESSION['pending_2fa_user_id']);
$_SESSION['user_id']       = $userId;
$_SESSION['authenticated'] = true;

header('Location: /dashboard.php');
exit;
```
