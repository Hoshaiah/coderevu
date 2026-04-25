---
slug: session-unvalidated-role-from-session
track: php
orderIndex: 37
title: Role Fetched From Session Only
difficulty: easy
tags:
  - sessions
  - security
  - authorization
language: php
---

## Context

This middleware lives in `middleware/RoleMiddleware.php` and is included at the top of every admin page. When a user logs in, the application stores their role directly into the session. This was intended as a performance optimisation to avoid a database round-trip on every request.

A support ticket was filed: a user whose account was demoted from `admin` to `user` by the superadmin console continued to access admin pages for up to several hours. The superadmin confirmed they changed the role in the database, but the affected user was still actively using admin features. The session was never invalidated.

The team checked that `session_start()` is called and that `session_destroy()` is called on logout. They concluded the session itself is working. The problem is in the trust model — what the session value is checked against.

## Buggy code

```php
<?php
// middleware/RoleMiddleware.php

session_start();

function requireRole(string $requiredRole): void
{
    if (!isset($_SESSION['user_id'])) {
        header('Location: /login.php');
        exit;
    }

    $userRole = $_SESSION['role'] ?? 'user';

    if ($userRole !== $requiredRole) {
        http_response_code(403);
        echo 'Access denied.';
        exit;
    }
}

requireRole('admin');
```
