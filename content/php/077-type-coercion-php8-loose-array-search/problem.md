---
slug: type-coercion-php8-loose-array-search
track: php
orderIndex: 77
title: Loose In-Array Role Check
difficulty: easy
tags:
  - type-coercion
  - security
  - authorization
  - roles
language: php
---

## Context

The helper function in `lib/auth.php` is used throughout the application to check whether the current user has a required role before granting access to sensitive operations. It is called in dozens of controllers with expressions like `require_role('admin')` or `require_role('billing')`.

A QA engineer discovered that `require_role(0)` — which no real call site produces — passes for any user. More practically, a code review found a controller that calls `require_role($config['min_role'])` where `$config['min_role']` comes from a YAML config file parsed with a library that occasionally returns integers instead of strings for numeric-looking values. In one config file, a role named `"0"` was stored without quotes and parsed as the integer `0`.

The bug has not been exploited in production, but the potential for any integer `0` to pass any role check is a critical authorisation flaw.

## Buggy code

```php
<?php
// lib/auth.php

function get_current_user_roles(): array {
    // Returns something like ['user', 'billing'] from the session
    return $_SESSION['roles'] ?? [];
}

function require_role(string $role): void {
    // Note: caller may pass a value coerced from config; type hint
    // only enforces at call time in strict_types mode
    $roles = get_current_user_roles();

    if (!in_array($role, $roles)) {
        http_response_code(403);
        exit(json_encode(['error' => 'Forbidden']));
    }
}

function has_role(string $role): bool {
    return in_array($role, get_current_user_roles());
}
```
