---
slug: type-coercion-array-key-loose-zero
track: php
orderIndex: 90
title: Loose Array Search Matches Wrong Key
difficulty: medium
tags:
  - type-coercion
  - security
  - permissions
language: php
---

## Context

This permission helper lives in `auth/Permissions.php` and is used across the application to check whether an action is permitted for the current user's role. The `$permissions` array maps role names (strings) to arrays of allowed action strings. It is populated from a configuration file at boot time.

A user with the role `'viewer'` reported being able to perform `'delete'` actions that should be restricted to `'admin'` only. The bug was intermittent and appeared to correlate with which role happened to occupy index `0` of the permissions array after the config was loaded. The ops team initially suspected a caching issue with the config loader.

Enabling strict PHP error reporting revealed no warnings. The bug does not appear in integration tests because the test harness builds the permissions array in a different order than production config loading.

## Buggy code

```php
<?php
// auth/Permissions.php

function can(string $role, string $action, array $permissions): bool
{
    if (!array_key_exists($role, $permissions)) {
        return false;
    }

    $allowed = $permissions[$role];

    // Check if the action is in the allowed list for this role
    return in_array($action, $allowed);
}

// Example permissions loaded from config:
$permissions = [
    'admin'  => ['create', 'read', 'update', 'delete'],
    'editor' => ['create', 'read', 'update'],
    'viewer' => ['read'],
];

// Called from a delete handler:
$role   = 'viewer';
$action = 0;   // BUG: action was cast to int somewhere upstream

if (can($role, $action, $permissions)) {
    echo "Permitted";
}
```
