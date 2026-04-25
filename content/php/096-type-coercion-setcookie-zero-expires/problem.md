---
slug: type-coercion-setcookie-zero-expires
track: php
orderIndex: 96
title: Integer Zero Expires Session Cookie
difficulty: hard
tags:
  - type-coercion
  - sessions
  - cookies
language: php
---

## Context

The file `auth/remember_me.php` issues a long-lived "remember me" cookie when a user checks the box during login. The expiry is computed as the current Unix timestamp plus a configurable number of seconds from `config.php`. A helper function wraps `setcookie()` and accepts the expiry as a parameter.

Users report that their "remember me" sessions expire immediately — they check the box, close the browser, reopen it, and find themselves logged out. The QA team tried setting `REMEMBER_ME_SECONDS` to large values like `2592000` (30 days) and still saw the bug. Debugging confirmed that the cookie is being set and the correct value is being read from config — but inspecting the browser's cookie jar shows the cookie has no expiry at all (session-scoped).

## Buggy code

```php
<?php
// auth/remember_me.php

define('REMEMBER_ME_SECONDS', 2592000); // 30 days

function issue_remember_me_cookie(string $token): void
{
    $expiry = time() + REMEMBER_ME_SECONDS;

    setcookie(
        'remember_token',
        $token,
        [
            'expire'   => $expiry,
            'path'     => '/',
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]
    );
}

$token = bin2hex(random_bytes(32));
issue_remember_me_cookie($token);
echo 'Cookie issued';
```
