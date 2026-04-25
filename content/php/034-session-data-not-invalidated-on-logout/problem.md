---
slug: session-data-not-invalidated-on-logout
track: php
orderIndex: 34
title: Logout Leaves Session Data Live
difficulty: easy
tags:
  - sessions
  - security
  - auth
language: php
---

## Context

This is `auth/logout.php`, the endpoint called when a user clicks "Sign out" in the navigation bar. It is a simple PHP file that clears the session and redirects. The application runs on PHP 8.1 with the default file-based session handler.

A penetration tester demonstrated that after clicking logout, the original session cookie still granted access to authenticated pages. They captured the `PHPSESSID` value before logout and replayed it in a new browser window after logout — the session was still valid on the server and the application treated the request as authenticated.

The developer had called `session_unset()`, believing that removed all session data. They were unaware that `session_unset()` clears the `$_SESSION` superglobal in memory but does not destroy the session file on disk. A replayed cookie causes the server to reload the session file, which is still present and now appears empty — but the application only checks `isset($_SESSION['user_id'])`, which evaluates to false on an empty array, so... actually the original code also forgot to destroy the session file, leaving the door open.

## Buggy code

```php
<?php
// auth/logout.php

session_start();

// Clear all session variables
session_unset();

// Expire the cookie on the client side
setcookie(
    session_name(),
    '',
    time() - 42000,
    '/'
);

header('Location: /login.php');
exit;
```
