---
slug: type-coercion-loose-json-boolean-role
track: php
orderIndex: 98
title: JSON Boolean Coerced to Admin Role
difficulty: hard
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

This middleware lives in `middleware/RoleCheck.php` in a PHP microservice that accepts JSON API requests. After JWT validation the token payload is decoded and stored in a request attribute. The `role` field in the token is a string like `'user'` or `'admin'`, but the code that extracts it from the decoded JWT sometimes returns a PHP boolean `true` when the JWT library is operating in a lenient mode and the token was issued by a legacy internal tool that set `role: true` instead of `role: "admin"`.

Engineers observed that a handful of legacy service accounts were gaining admin access to the API unexpectedly. The JWT tokens those accounts used were valid (signature verified) but contained `\"role\": true` (a JSON boolean) rather than `\"role\": \"admin\"`. The team assumed that since `true !== 'admin'` the check would fail — they were wrong.

The bug is subtle: it passes code review because the developer sees `!= 'admin'` and thinks 'strict types will save me', but it's not using `!==`.

## Buggy code

```php
<?php
// middleware/RoleCheck.php

class RoleCheck
{
    public function requireAdmin(array $tokenPayload): void
    {
        $role = $tokenPayload['role'] ?? null;

        if ($role != 'admin') {
            throw new UnauthorizedException('Admin role required');
        }
    }

    public function requireRole(array $tokenPayload, string $requiredRole): void
    {
        $role = $tokenPayload['role'] ?? null;

        if ($role != $requiredRole) {
            throw new UnauthorizedException("Role '$requiredRole' required");
        }
    }
}
```
