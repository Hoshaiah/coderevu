---
slug: queries-update-missing-where-clause
track: php
orderIndex: 56
title: UPDATE Without WHERE Condition
difficulty: easy
tags:
  - queries
  - correctness
  - data-loss
language: php
---

## Context

This script lives at `cron/expire_tokens.php` and is run every minute by a system cron job. Its job is to mark password-reset tokens as expired once they are older than one hour. The application uses PDO with MySQL.

The on-call engineer received an alert at 02:00 showing every user in the `users` table had their `reset_token_expires_at` column set to `NULL` and `reset_token` set to `NULL`. All pending password resets were invalidated simultaneously, and the support queue filled up. The engineer initially suspected a rogue admin action.

On closer inspection the cron job log showed a successful execution at 01:59 affecting 84,000 rows instead of the expected handful.

## Buggy code

```php
<?php
// cron/expire_tokens.php

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$expiryCutoff = date('Y-m-d H:i:s', strtotime('-1 hour'));

$stmt = $pdo->prepare(
    'UPDATE users
     SET reset_token = NULL,
         reset_token_expires_at = NULL'
);

$stmt->execute([$expiryCutoff]);

echo 'Expired ' . $stmt->rowCount() . ' tokens.' . PHP_EOL;
```
