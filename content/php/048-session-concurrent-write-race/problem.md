---
slug: session-concurrent-write-race
track: php
orderIndex: 48
title: Session Write Race on Balance Update
difficulty: hard
tags:
  - sessions
  - concurrency
  - race-condition
language: php
---

## Context

The virtual wallet feature at `wallet/spend.php` lets users redeem points from a session-cached balance. To avoid a database hit on every page load, the current point balance is stored in `$_SESSION['points']` and refreshed from the database only at login and after explicit top-ups. The `spend.php` endpoint deducts points and updates both the session and the database.

The fraud team flagged accounts that have negative point balances in the database, meaning users spent more points than they ever had. The issue is reproducible by opening two browser tabs and submitting the spend form simultaneously. The team suspected a database race and added a transaction with `SELECT FOR UPDATE`, which didn't help — the negative balances continued.

After adding verbose logging, engineers noticed that both concurrent requests read the same session balance, each verified it was sufficient, and each proceeded to deduct. The database update has correct locking, but by then both requests had already passed the balance check using the stale session value.

## Buggy code

```php
<?php
// wallet/spend.php

session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(403);
    exit;
}

$cost   = (int) ($_POST['cost']   ?? 0);
$item   = (string) ($_POST['item'] ?? '');

if ($cost <= 0) {
    exit('Invalid cost');
}

$pdo = new PDO('mysql:host=localhost;dbname=app', 'web', 'secret');

// Check session balance (fast path, avoids DB read)
if ($_SESSION['points'] < $cost) {
    exit('Insufficient points');
}

// Deduct in DB with a transaction
$pdo->beginTransaction();
$stmt = $pdo->prepare('SELECT points FROM wallets WHERE user_id = ? FOR UPDATE');
$stmt->execute([$_SESSION['user_id']]);
$db_balance = $stmt->fetchColumn();

if ($db_balance < $cost) {
    $pdo->rollBack();
    exit('Insufficient points');
}

$pdo->prepare('UPDATE wallets SET points = points - ? WHERE user_id = ?')
    ->execute([$cost, $_SESSION['user_id']]);
$pdo->commit();

// Update session balance
$_SESSION['points'] -= $cost;

echo json_encode(['ok' => true, 'remaining' => $_SESSION['points']]);
```
