---
slug: php-deserialization-cookie
track: php
orderIndex: 24
title: >-
  Session data is deserialized from a user-controlled cookie, enabling remote
  code execution
difficulty: hard
tags:
  - security
  - deserialization
  - rce
  - cookie
language: php
---

## Context

A legacy application stores a serialized PHP object in a cookie to preserve user preferences across sessions without a database. A penetration tester demonstrated that crafting a cookie with a malicious serialized payload — exploiting a `__wakeup` or `__destruct` magic method on an autoloaded class — led to arbitrary file deletion and, with the right gadget chain, remote code execution.

## Buggy code

```php
<?php
// middleware/load_preferences.php

/**
 * Load user preferences from the signed cookie, falling back to defaults.
 */
function load_user_preferences(): UserPreferences
{
    $cookie = $_COOKIE['user_prefs'] ?? null;

    if ($cookie !== null) {
        $data = base64_decode($cookie);
        $prefs = unserialize($data);

        if ($prefs instanceof UserPreferences) {
            return $prefs;
        }
    }

    return new UserPreferences();
}

class UserPreferences
{
    public string $theme    = 'light';
    public string $language = 'en';
    public int    $pageSize = 25;
}
```
