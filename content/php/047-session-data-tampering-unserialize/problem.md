---
slug: session-data-tampering-unserialize
track: php
orderIndex: 47
title: User Input Stored Raw in Session
difficulty: hard
tags:
  - sessions
  - security
  - untrusted-input
language: php
---

## Context

The preferences endpoint in `account/preferences.php` lets authenticated users save UI settings — their preferred timezone, language, and dashboard layout — which are then loaded from the session on every page render to personalise the interface. Settings submitted via POST are merged directly into `$_SESSION['prefs']` after a check that the submitted keys are in an allowlist.

A security analyst found that certain scalar preference values, when stored in the session and later read back by other parts of the application, influence code paths in unexpected ways. Specifically, the `timezone` value is passed to `date_default_timezone_set()` without validation, allowing an attacker to supply a timezone string that triggers a PHP warning — leaking the full filesystem path in the error message — or to supply a value that shifts all timestamp calculations site-wide for that session.

The allowlist check on key names was verified to be correct. The vulnerability is that arbitrary string values are accepted for keys whose values should be constrained to a known set.

## Buggy code

```php
<?php
// account/preferences.php

require_once __DIR__ . '/../bootstrap.php';

session_start();

$user_id = $_SESSION['user_id'] ?? null;
if (!$user_id) {
    http_response_code(401);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $allowed_keys = ['timezone', 'language', 'layout'];
    foreach ($allowed_keys as $key) {
        if (isset($_POST[$key])) {
            $_SESSION['prefs'][$key] = $_POST[$key];
        }
    }
}

// Apply preferences for this request
$prefs = $_SESSION['prefs'] ?? [];
if (!empty($prefs['timezone'])) {
    date_default_timezone_set($prefs['timezone']);
}

$lang = $prefs['language'] ?? 'en';

echo json_encode(['saved' => true, 'language' => $lang]);
exit;
```
