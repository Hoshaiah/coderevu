---
slug: session-fixation-anon-cart
track: php
orderIndex: 42
title: Session ID Preserved Across Login
difficulty: medium
tags:
  - sessions
  - session-fixation
  - auth
  - security
language: php
---

## Context

The file `src/Auth/LoginController.php` handles the POST leg of the sign-in form for a small e-commerce application. The site supports anonymous shopping carts: visitors get a session the moment they land on the storefront, and their cart contents are stored under that session ID. On login, the cart is merged into the authenticated user's saved cart and the visitor is redirected to `/account/dashboard`.

A penetration tester demonstrated that she could hijack any account she could trick into logging in by first visiting the site herself to obtain a session cookie, then sending the victim a login link that included a `PHPSESSID` cookie pre-set to her known value (via a subdomain cookie-injection gadget found elsewhere on the domain). After the victim logs in, her own browser — still holding that same session ID — shows the victim's account page.

The dev team believed `session_start()` at the top of every page was sufficient protection. It is not. The cart-merge logic and database writes are correct; the problem is purely in how the session is handled at the authentication boundary.

## Buggy code

```php
<?php
// src/Auth/LoginController.php

require_once __DIR__ . '/../../bootstrap.php';

session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: /login');
    exit;
}

$email    = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

$pdo  = get_db_connection();
$stmt = $pdo->prepare("SELECT id, password_hash FROM users WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password_hash'])) {
    $_SESSION['login_error'] = 'Invalid email or password.';
    header('Location: /login');
    exit;
}

// Merge anonymous cart into user's saved cart
$anon_cart = $_SESSION['cart'] ?? [];
merge_cart($pdo, $user['id'], $anon_cart);

$_SESSION['user_id'] = $user['id'];
$_SESSION['cart']    = [];

header('Location: /account/dashboard');
exit;
```
