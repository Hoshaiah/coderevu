---
slug: type-coercion-in-array-zero
track: php
orderIndex: 83
title: Loose in_array Matches Zero
difficulty: medium
tags:
  - type-coercion
  - security
  - authorization
language: php
---

## Context

The middleware in `src/Middleware/RoleMiddleware.php` guards a set of internal API routes by checking whether the authenticated user holds one of the roles required for the requested endpoint. Roles are stored as strings in a `roles` column (e.g., `'admin'`, `'editor'`, `'viewer'`). The allowed-roles list for each route is defined as a plain PHP array of strings in a route config file.

After a routine deployment a non-privileged user with role `'viewer'` reported that they could access an endpoint documented as admin-only. Audit logs show the request was granted, not leaked from a cache. Rolling back the deployment did not reproduce the issue, but reviewing the diff reveals only a refactor of this middleware file — no logic was supposed to change.

The QA team cannot reproduce the problem with a user whose role is `'editor'`. It only affects users whose numeric user ID happens to be 0 — which turned out to apply to a legacy seed account used for smoke tests.

## Buggy code

```php
<?php
// src/Middleware/RoleMiddleware.php

require_once __DIR__ . '/../../bootstrap.php';

function require_role(array $allowed_roles): void
{
    session_start();

    $user_id = $_SESSION['user_id'] ?? null;
    if ($user_id === null) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $pdo  = get_db_connection();
    $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }

    $user_role = $row['role'];  // e.g. 'viewer'

    if (!in_array($user_role, $allowed_roles)) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
}

// Usage: require_role(['admin', 'superuser']);
require_role(['admin', 'superuser']);

echo json_encode(['data' => 'sensitive admin payload']);
```
