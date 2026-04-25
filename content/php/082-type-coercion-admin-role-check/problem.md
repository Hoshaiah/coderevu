---
slug: type-coercion-admin-role-check
track: php
orderIndex: 82
title: Loose Role Comparison Grants Admin Access
difficulty: medium
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

This is `middleware/require_admin.php`, included at the top of every admin panel page. It reads the user's role from the session and compares it against the constant `ROLE_ADMIN`, which is defined as the integer `1` in `config/roles.php`. The `role` column in the `users` table is a VARCHAR that stores human-readable strings like `'admin'`, `'editor'`, and `'viewer'`.

During a user acceptance test, a tester with a `'viewer'` account accidentally gained access to the admin dashboard. The session was inspected and `$_SESSION['role']` contained the string `'viewer'` — not `'admin'`. The page should have redirected them away, but it did not.

The developer looked at the constant definition and the comparison line, saw `1` and `'viewer'`, and could not immediately understand how PHP evaluated `'viewer' == 1` as truthy. They escalated to a senior engineer who recognised the PHP 7 type-juggling rule at play.

## Buggy code

```php
<?php
// middleware/require_admin.php

require_once __DIR__ . '/../config/roles.php';
// roles.php defines: const ROLE_ADMIN = 1;

session_start();

if (!isset($_SESSION['user_id'])) {
    header('Location: /login.php');
    exit;
}

$role = $_SESSION['role'] ?? null;

// Intended: only let through users whose role equals ROLE_ADMIN (1)
if ($role == ROLE_ADMIN) {
    return; // access granted
}

header('Location: /dashboard.php');
exit('Access denied.');
```
