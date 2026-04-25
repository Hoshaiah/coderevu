---
slug: session-privilege-not-refreshed
track: php
orderIndex: 40
title: Stale Session Privilege Escalation
difficulty: medium
tags:
  - sessions
  - security
  - authorization
  - privilege-escalation
language: php
---

## Context

The file `admin/promote.php` lets a super-admin promote a regular user to the `admin` role. It updates the `role` column in the `users` table and then redirects back to the user list. The application stores the currently logged-in user's role in `$_SESSION['role']` at login time and checks it on every protected page.

Several support tickets have come in from newly promoted admins saying they cannot access admin features even after being promoted — they have to log out and back in before the new permissions take effect. More worryingly, an internal audit found that a user who had their admin role *revoked* continued to access admin pages for the rest of their session without any error.

The database updates are confirmed to be writing correctly. The issue is entirely in how the application maintains session state relative to the database role.

## Buggy code

```php
<?php
// admin/promote.php

session_start();

if ($_SESSION['role'] !== 'super_admin') {
    http_response_code(403);
    exit('Forbidden');
}

$conn = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');

$targetId  = (int) $_POST['user_id'];
$newRole   = $_POST['role']; // 'admin' or 'user'

$allowed = ['admin', 'user'];
if (!in_array($newRole, $allowed, true)) {
    exit('Invalid role');
}

$stmt = $conn->prepare('UPDATE users SET role = ? WHERE id = ?');
$stmt->execute([$newRole, $targetId]);

header('Location: /admin/users.php?updated=1');
exit;
```
