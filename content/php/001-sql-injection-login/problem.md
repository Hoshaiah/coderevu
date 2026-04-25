---
slug: sql-injection-login
track: php
orderIndex: 1
title: "Login endpoint concatenates raw input into SQL"
difficulty: easy
tags: [security, sql-injection, auth]
language: php
---

## Context

A legacy admin login endpoint. A pentest report flagged this file with severity *critical*. The engineer who wrote it insisted it's "fine because we escape with addslashes on signup." It's not fine. Find and fix every security issue.

## Buggy code

```php
<?php
// admin/login.php

session_start();
$conn = mysqli_connect("localhost", "app", "password", "app_db");

$username = $_POST["username"];
$password = $_POST["password"];

$query = "SELECT id, password_hash FROM admins WHERE username = '$username'";
$result = mysqli_query($conn, $query);
$row = mysqli_fetch_assoc($result);

if ($row && md5($password) === $row["password_hash"]) {
    $_SESSION["admin_id"] = $row["id"];
    header("Location: /admin/dashboard.php");
    exit;
}

echo "Login failed";
```
