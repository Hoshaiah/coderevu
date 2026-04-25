---
slug: type-coercion-preg-match-truthiness
track: php
orderIndex: 93
title: Truthy preg_match Return Skips Validation
difficulty: hard
tags:
  - type-coercion
  - security
  - input-validation
language: php
---

## Context

The helper `validate_username()` in `lib/validators.php` is called during user registration and profile updates to ensure usernames contain only alphanumeric characters and underscores. It is also used as an input guard before a raw filesystem path is constructed to create a per-user data directory. The function's return value is used as a boolean gate in several call sites.

A security review found that a specially crafted username can pass validation and cause directory traversal. The finding was surprising because `preg_match` is considered reliable for pattern matching. The reviewer traced the issue to the return value semantics of `preg_match` combined with how PHP evaluates falsiness.

The team confirmed that PHPUnit tests for `validate_username()` pass for all their existing test cases including `'../../etc'`, `'admin/../root'`, and empty string. The flaw only manifests with a specific category of input that the tests didn't cover.

## Buggy code

```php
<?php
// lib/validators.php

function validate_username(string $input): bool
{
    // Must be 3-30 chars, alphanumeric + underscores only
    $result = preg_match('/^[a-z0-9_]{3,30}$/', $input);
    // preg_match returns 1 on match, 0 on no-match, false on error
    return !$result == false;
}

// lib/user_setup.php

function create_user_directory(string $username): void
{
    if (!validate_username($username)) {
        throw new InvalidArgumentException('Invalid username');
    }
    $base = '/var/app/userdata/';
    mkdir($base . $username, 0750, true);
}
```
