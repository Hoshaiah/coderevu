---
slug: session-regenerate-missing-role-change
track: php
orderIndex: 44
title: No Session Regeneration on Sudo
difficulty: medium
tags:
  - sessions
  - security
  - privilege-escalation
language: php
---

## Context

The application at `admin/sudo.php` implements a "re-authenticate to confirm" flow. Editors who want to perform destructive operations (bulk deletes, publishing changes) must re-enter their password before the session is upgraded to a `sudo_mode` flag. This is modeled after GitHub's sudo mode and is supposed to prevent attackers who gain brief access to a logged-in browser from doing lasting damage.

A penetration tester demonstrated that session fixation completely bypasses this control: an attacker plants a known session ID in the victim's browser before login, the victim logs in and later enters their password in the sudo prompt, and the attacker's browser — with the same ID — now has `sudo_mode` set. The team fixed the session fixation at login but forgot that privilege elevation also needs the same treatment.

## Buggy code

```php
<?php
// admin/sudo.php

session_start();

if (empty($_SESSION['user_id'])) {
    header('Location: /login.php');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = $_POST['password'] ?? '';

    $pdo  = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
    $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row && password_verify($password, $row['password_hash'])) {
        $_SESSION['sudo_mode']    = true;
        $_SESSION['sudo_expires'] = time() + 300;
        header('Location: /admin/dashboard.php');
        exit;
    }

    $error = 'Incorrect password.';
}

include 'views/sudo_form.php';
```
