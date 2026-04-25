---
slug: queries-no-index-json-column-filter
track: php
orderIndex: 64
title: Full Table Scan on JSON Column
difficulty: medium
tags:
  - queries
  - performance
  - mysql
language: php
---

## Context

The worker script `workers/notification_dispatch.php` runs every minute via cron. It fetches users who have opted into a particular notification type stored in a JSON `preferences` column, then dispatches push notifications. The `users` table has grown to 800,000 rows. The preferences column stores a JSON object such as `{"marketing": true, "digest": false}`.

The cron job started timing out after the table passed 500k rows. The DBA added an index on `email` and `created_at`, but the slow query log shows this particular query still does a full table scan taking 12–18 seconds. The engineer assumed that because the query uses a `WHERE` clause it must be using an index.

## Buggy code

```php
<?php
// workers/notification_dispatch.php

$pdo = new PDO('mysql:host=localhost;dbname=app', 'worker', 'secret', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$type = 'marketing'; // dispatched type; could also be 'digest', etc.

// Fetch all users who opted into $type notifications
$stmt = $pdo->prepare(
    "SELECT id, email
     FROM users
     WHERE JSON_EXTRACT(preferences, '$.".  $type . "') = true
     AND active = 1"
);
$stmt->execute();
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($users as $user) {
    // dispatch_push_notification($user['id'], $type);
    echo "Dispatching to user {$user['id']}\n";
}
```
