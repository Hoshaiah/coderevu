---
slug: queries-unbounded-in-clause
track: php
orderIndex: 61
title: Unbounded IN Clause from User List
difficulty: medium
tags:
  - queries
  - performance
  - security
language: php
---

## Context

The admin tool at `admin/bulk_notify.php` lets support staff send a notification to a manually selected list of user IDs. The IDs are submitted as a comma-separated string from a multi-select widget in the admin UI. The endpoint is behind HTTP Basic Auth and an IP allowlist, so it is considered internal-only.

The database team filed a performance ticket after observing long-running queries in the slow query log. The guilty query is an `IN (...)` clause with thousands of elements — it turns out some support staff are pasting entire CSV exports of user IDs into the widget. MySQL's query planner degrades significantly for very large `IN` lists, causing table scans and locking contention during peak hours.

Separately, the security team noted that although the endpoint is internal, the IN clause values are not individually validated — a staffer (or XSS payload on the admin UI) could inject arbitrary SQL fragments into the constructed list.

## Buggy code

```php
<?php
// admin/bulk_notify.php

$pdo = new PDO('mysql:host=localhost;dbname=app', 'admin', 'secret');

$raw_ids = $_POST['user_ids'] ?? ''; // e.g. "12,45,99,1023"
$message = $_POST['message'] ?? '';

$id_list = implode(',', explode(',', $raw_ids)); // "clean up" duplicated commas

$sql = "SELECT id, email FROM users WHERE id IN ($id_list)";
$stmt = $pdo->query($sql);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($users as $user) {
    mail($user['email'], 'Important notice', $message);
}

echo 'Notified ' . count($users) . ' users';
```
