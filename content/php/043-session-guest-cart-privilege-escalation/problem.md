---
slug: session-guest-cart-privilege-escalation
track: php
orderIndex: 43
title: "Session Role Not Reset on Login"
difficulty: medium
tags: ["sessions", "security", "auth"]
language: php
---

## Context

The file `checkout/login.php` handles mid-checkout authentication for a Laravel-free custom PHP storefront. Guests can browse and add items to a cart stored in the session. When they reach checkout they can log in without losing their cart. The session already exists by the time login happens, carrying `$_SESSION['cart']` and `$_SESSION['guest_discount']` among other keys.

The customer support team started receiving complaints that some users see "employee pricing" after logging in, even though those users are ordinary customers. The discount is meant only for users with `$_SESSION['role'] = 'employee'`. Audit logs show the session ID is the same before and after login for affected users.

Engineers confirmed that the employee discount flag is never written during the login flow itself. They looked at the database query and verified it returns the correct `role = 'customer'` for the affected accounts.

## Buggy code

```php
<?php
// checkout/login.php

session_start();

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'web', 'secret');

$email    = $_POST['email']    ?? '';
$password = $_POST['password'] ?? '';

$stmt = $pdo->prepare('SELECT id, password_hash, role FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user && password_verify($password, $user['password_hash'])) {
    // Preserve the cart across login
    $cart = $_SESSION['cart'] ?? [];

    session_regenerate_id(true);

    $_SESSION['cart']    = $cart;
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['role']    = $user['role'];

    header('Location: /checkout/review');
    exit;
}

echo 'Invalid credentials';
```
