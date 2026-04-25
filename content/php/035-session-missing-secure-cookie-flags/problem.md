---
slug: session-missing-secure-cookie-flags
track: php
orderIndex: 35
title: Session Cookie Missing Secure Flags
difficulty: easy
tags:
  - sessions
  - security
  - cookies
  - https
language: php
---

## Context

This is `public/index.php`, the front controller for a PHP web application deployed on HTTPS. It calls `session_start()` before routing, relying on PHP's default session cookie configuration. The application handles authenticated user sessions including access to personal and financial data.

The security team ran an automated scanner against the staging environment and found two findings: the session cookie is transmitted over HTTP if a user accidentally visits the HTTP version of the site (the reverse proxy does not enforce HTTPS for all paths), and the session cookie is accessible via JavaScript, making it vulnerable to theft via XSS.

A developer argued that "the app uses HTTPS so the `Secure` flag is implied." This is incorrect — the PHP default does not set `Secure` automatically, and the `HttpOnly` flag is off by default in some PHP configurations.

## Buggy code

```php
<?php
// public/index.php

define('APP_ROOT', dirname(__DIR__));
require APP_ROOT . '/vendor/autoload.php';

// Start session with default PHP settings
session_start();

$router = new App\Router();
$router->dispatch($_SERVER['REQUEST_URI'], $_SERVER['REQUEST_METHOD']);
```
