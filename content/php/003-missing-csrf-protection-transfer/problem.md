---
slug: missing-csrf-protection-transfer
track: php
orderIndex: 3
title: >-
  Bank transfer form has no CSRF token, allowing any website to trigger
  transfers on behalf of logged-in users
difficulty: easy
tags:
  - security
  - csrf
  - forms
  - session
language: php
---

## Context

A small fintech app lets users transfer funds between internal accounts via an HTML form. The form POSTs to a PHP handler that reads the session and executes the transfer. A security researcher demonstrated that embedding a hidden form on a third-party site that auto-submits via JavaScript could trigger transfers from any logged-in user who visits the malicious page.

## Buggy code

```php
<?php
// transfers/submit.php

session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(403);
    exit;
}

$pdo = new PDO('mysql:host=db;dbname=bank', 'app', getenv('DB_PASSWORD'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$fromAccount = (int) $_POST['from_account'];
$toAccount   = (int) $_POST['to_account'];
$amount      = (int) round((float) $_POST['amount'] * 100); // store as cents
$userId      = (int) $_SESSION['user_id'];

if ($amount <= 0) {
    http_response_code(400);
    echo 'Invalid amount';
    exit;
}

// Verify the from-account belongs to this user.
$stmt = $pdo->prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?');
$stmt->execute([$fromAccount, $userId]);
if (!$stmt->fetch()) {
    http_response_code(403);
    echo 'Account not yours';
    exit;
}

$pdo->prepare(
    'INSERT INTO transfers (from_account, to_account, amount_cents, created_at)
     VALUES (?, ?, ?, NOW())'
)->execute([$fromAccount, $toAccount, $amount]);

header('Location: /transfers?success=1');
exit;
```
