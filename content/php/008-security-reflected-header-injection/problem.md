---
slug: security-reflected-header-injection
track: php
orderIndex: 8
title: Reflected Input in Location Header
difficulty: easy
tags:
  - security
  - header-injection
  - redirect
language: php
---

## Context

The file `auth/sso_return.php` handles the return leg of a simple SSO flow. After authenticating with an identity provider, users are redirected back to this script with a `return_to` query parameter indicating where they should land inside the application. The parameter is URL-encoded by the identity provider but its value originates from user input at SSO initiation.

A penetration tester submitted a report showing they can inject arbitrary HTTP response headers by crafting a `return_to` value containing a CRLF sequence (`%0d%0a`). On PHP versions where `header()` does not strip newlines, this allows the attacker to inject headers such as `Set-Cookie` into the response, enabling session hijacking of victims who click a crafted SSO link.

The team initially dismissed the report because the app runs on PHP 8, believing PHP 8 automatically blocks header injection. PHP 8 does throw a warning and truncate in some SAPI/version combinations — but not all, and the `return_to` value is also written into a meta-refresh tag, which is a separate reflected XSS vector.

## Buggy code

```php
<?php
// auth/sso_return.php

session_start();

if (empty($_SESSION['sso_state']) || $_GET['state'] !== $_SESSION['sso_state']) {
    http_response_code(400);
    exit('Invalid SSO state');
}

unset($_SESSION['sso_state']);
$_SESSION['user_id'] = (int) $_GET['user_id'];

$return_to = $_GET['return_to'] ?? '/dashboard';

header('Location: ' . $return_to);
echo '<meta http-equiv="refresh" content="0;url=' . $return_to . '">';
exit;
```
