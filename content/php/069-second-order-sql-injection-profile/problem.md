---
slug: second-order-sql-injection-profile
track: php
orderIndex: 69
title: Stored Input Injected Into Later Query
difficulty: hard
tags:
  - queries
  - security
  - sql-injection
language: php
---

## Context

The application is a multi-tenant SaaS platform. `profile/update.php` accepts a username change, runs it through `mysqli_real_escape_string()`, and stores it safely in the `users` table. Later, `admin/reports/user_activity.php` generates a per-user activity report. It fetches the username from the database (trusting it as "already sanitised") and drops it raw into a second query that joins the `audit_log` table.

The security team has never seen an attack in production logs because the payload must survive a round-trip through the database and only fires when an admin views the report page. A routine penetration test discovered that an attacker with a standard user account can rename themselves to a SQL fragment, then wait for an admin to pull their activity report — at which point arbitrary SQL executes with the database user's full privileges.

The escape on write only prevents injection into the INSERT/UPDATE. The value is stored verbatim (with the escape characters stripped by MySQL), so when it is read back and placed into a new query without parameterisation, the injection is live.

## Buggy code

```php
<?php
// admin/reports/user_activity.php
// Requires: admin session already validated above this snippet.

require __DIR__ . '/../../db.php'; // provides $conn (mysqli)

$user_id = (int) $_GET['user_id'];

// Step 1: fetch the username from the users table ("safe" — came from our DB)
$res  = mysqli_query($conn, "SELECT username FROM users WHERE id = $user_id");
$user = mysqli_fetch_assoc($res);

if (!$user) {
    http_response_code(404);
    exit('User not found.');
}

$username = $user['username'];

// Step 2: use the username in a second query to fetch audit rows
$log_query = "SELECT action, created_at FROM audit_log
               WHERE actor_username = '$username'
               ORDER BY created_at DESC
               LIMIT 200";

$log_result = mysqli_query($conn, $log_query);

$rows = [];
while ($row = mysqli_fetch_assoc($log_result)) {
    $rows[] = $row;
}

header('Content-Type: application/json');
echo json_encode($rows);
```
