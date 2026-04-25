---
slug: session-fixation-remember-me
track: php
orderIndex: 39
title: Persistent Cookie Skips Session Regeneration
difficulty: medium
tags:
  - sessions
  - security
  - auth
language: php
---

## Context

This is `auth/remember_me.php`, a middleware-style file included at the top of every page in a consumer e-commerce application. When a visitor has no active PHP session but carries a `remember_token` cookie, it looks up the token in the database, validates it, and re-hydrates the session — effectively logging the user back in automatically. The stack is PHP 8.0 + MySQL 8.

A security audit flagged that an attacker who captures a victim's `PHPSESSID` cookie before the remember-me flow runs can retain access even after the legitimate user's session would otherwise expire. The auditor demonstrated the attack on a shared Wi-Fi network. The developer patched a CSRF issue found in the same audit but marked this finding "unlikely" and closed it without changes.

The key observation is that the code restores session variables but never alters the session ID itself. Any session ID that existed before authentication — including one planted by an attacker — becomes a fully authenticated session after this file runs.

## Buggy code

```php
<?php
// auth/remember_me.php

session_start();

if (!empty($_SESSION['user_id'])) {
    // Already authenticated, nothing to do.
    return;
}

$token = $_COOKIE['remember_token'] ?? null;
if (!$token) {
    return;
}

require_once __DIR__ . '/../db.php'; // provides $pdo

$stmt = $pdo->prepare(
    "SELECT user_id, expires_at FROM remember_tokens WHERE token = ? LIMIT 1"
);
$stmt->execute([$token]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row || strtotime($row['expires_at']) < time()) {
    setcookie('remember_token', '', time() - 3600, '/', '', true, true);
    return;
}

// Restore the session
$_SESSION['user_id'] = $row['user_id'];
$_SESSION['authed_via'] = 'remember_me';
```
