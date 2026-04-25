---
slug: session-object-injection-flash-message
track: php
orderIndex: 49
title: Unserialized Session Flash Data
difficulty: hard
tags:
  - sessions
  - security
  - deserialization
language: php
---

## Context

This is `src/Http/FlashMessage.php`, a small helper that stores one-time notification messages ("Your profile was saved", "Invalid password") across a redirect. It serializes an arbitrary value into `$_SESSION` so it can hold any type — strings, arrays, even objects — without the developer needing to think about it.

A security audit flagged the endpoint `POST /login` as potentially exploitable via a crafted session cookie when the application has any class in its autoloader that implements a `__wakeup()` or `__destruct()` method with file-system or database side effects (common in Symfony/Doctrine-heavy apps). The auditor called it a PHP Object Injection gadget chain entry point.

The dev team initially dismissed it: "The session is stored server-side, an attacker can't write to it." But the flash message is also read from `$_GET['flash']` as a fallback when the session isn't writable — that part was added hastily during a deployment issue and never removed.

## Buggy code

```php
<?php
// src/Http/FlashMessage.php

class FlashMessage
{
    public static function set(mixed $message): void
    {
        $_SESSION['_flash'] = serialize($message);
    }

    public static function get(): mixed
    {
        // Fallback: if flash not in session, allow passing it via query string
        // (used during deployments when session storage is temporarily unavailable)
        $raw = $_SESSION['_flash'] ?? $_GET['flash'] ?? null;

        if ($raw === null) {
            return null;
        }

        unset($_SESSION['_flash']);
        return unserialize($raw);
    }
}
```
