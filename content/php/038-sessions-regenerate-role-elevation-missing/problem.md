---
slug: sessions-regenerate-role-elevation-missing
track: php
orderIndex: 38
title: No Session Regeneration on Role Change
difficulty: easy
tags:
  - sessions
  - security
  - session-fixation
language: php
---

## Context

This is `admin/impersonate.php`, a super-admin tool that lets support staff temporarily assume the identity of a customer account to debug issues. It is protected by a middleware check that verifies `$_SESSION['role'] === 'superadmin'` before the page loads.

The security team flagged that a support agent who uses the impersonation feature and then hands their workstation to a colleague (or simply leaves it unlocked) leaves behind a session that now has customer-level privileges but the same session ID it had at the superadmin level. More critically, if a malicious actor manages to plant a known session ID in the agent's browser before impersonation begins, they can hijack the resulting customer session.

No CVE has been filed yet, but the team wants it fixed before the next audit. The rest of the auth system correctly regenerates IDs on login and logout.

## Buggy code

```php
<?php
// admin/impersonate.php

session_start();

if (($_SESSION['role'] ?? '') !== 'superadmin') {
    http_response_code(403);
    exit('Forbidden');
}

$targetUserId = (int) $_POST['user_id'];

$db = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$stmt = $db->prepare('SELECT id, email, role FROM users WHERE id = ?');
$stmt->execute([$targetUserId]);
$targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$targetUser) {
    http_response_code(404);
    exit('User not found');
}

// Store original admin identity so we can restore it later
$_SESSION['_original_admin_id']   = $_SESSION['user_id'];
$_SESSION['_original_admin_role'] = $_SESSION['role'];

$_SESSION['user_id'] = $targetUser['id'];
$_SESSION['role']    = $targetUser['role'];
$_SESSION['email']   = $targetUser['email'];

header('Location: /dashboard.php');
exit;
```
