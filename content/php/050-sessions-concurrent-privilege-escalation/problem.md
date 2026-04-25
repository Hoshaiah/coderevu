---
slug: sessions-concurrent-privilege-escalation
track: php
orderIndex: 50
title: Stale Role Cached in Session
difficulty: hard
tags:
  - sessions
  - security
  - authorization
language: php
---

## Context

The method below lives in `src/Auth/Session.php` and is called at the start of every request to populate the current user context. Roles are stored in a `user_roles` table and can be changed by super-admins through an internal tools panel. The method caches the role in `$_SESSION` to avoid a database round-trip on every request.

The security team discovered that when a super-admin downgrades a user from `admin` to `viewer`, the demoted user continues to have full admin access until their session naturally expires (24 hours by default). The super-admin panel showed the role as `viewer` immediately, but the application still honoured admin actions.

The team confirmed the `user_roles` table is updated correctly and immediately. The issue is purely in how the session caches the role.

## Buggy code

```php
<?php
// src/Auth/Session.php

class Session
{
    public function __construct(private PDO $pdo) {}

    public function getCurrentUser(): ?array
    {
        session_start();

        if (!isset($_SESSION['user_id'])) {
            return null;
        }

        // Serve from session cache to avoid DB hit on every request
        if (isset($_SESSION['user_role'])) {
            return [
                'id'   => $_SESSION['user_id'],
                'role' => $_SESSION['user_role'],
            ];
        }

        $stmt = $this->pdo->prepare(
            'SELECT r.role_name
             FROM user_roles r
             WHERE r.user_id = ?'
        );
        $stmt->execute([$_SESSION['user_id']]);
        $roleRow = $stmt->fetch(PDO::FETCH_ASSOC);

        $_SESSION['user_role'] = $roleRow['role_name'] ?? 'viewer';

        return [
            'id'   => $_SESSION['user_id'],
            'role' => $_SESSION['user_role'],
        ];
    }
}
```
