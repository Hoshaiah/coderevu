---
slug: type-coercion-loose-in-array-string
track: php
orderIndex: 86
title: Loose in_array Role Check
difficulty: medium
tags:
  - type-coercion
  - security
  - authorization
language: php
---

## Context

The function below lives in `src/Auth/RoleGuard.php` and is called from every admin controller to decide whether the current user may access a page. Roles are stored as strings in a MySQL `VARCHAR(32)` column and loaded into the session as-is after login.

The security team noticed during a quarterly review that a user account with role `0` was able to access every admin panel. The developer who wrote the guard said "roles come from the database as strings, so `in_array` is perfectly safe". The claim is incorrect in a subtle way.

The application runs PHP 8.0. Roles in the database are string values like `"editor"`, `"moderator"`, and `"admin"`. Guest/unauthenticated sessions have no role key, but through a separate bug a handful of accounts ended up with the string `"0"` stored as their role.

## Buggy code

```php
<?php
// src/Auth/RoleGuard.php

class RoleGuard
{
    private array $allowedRoles;

    public function __construct(array $allowedRoles)
    {
        $this->allowedRoles = $allowedRoles;
    }

    public function check(string $userRole): bool
    {
        return in_array($userRole, $this->allowedRoles);
    }
}

// Called from AdminController:
$guard = new RoleGuard(['admin', 'superadmin']);
if (!$guard->check($_SESSION['role'] ?? '')) {
    http_response_code(403);
    exit('Forbidden');
}
```
