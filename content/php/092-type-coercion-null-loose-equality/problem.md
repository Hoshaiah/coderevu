---
slug: type-coercion-null-loose-equality
track: php
orderIndex: 92
title: Null Coercion in Permission Check
difficulty: hard
tags:
  - type-coercion
  - security
  - authorization
language: php
---

## Context

The function `can_access_resource()` is defined in `lib/acl.php` and called throughout a multi-tenant SaaS dashboard to gate resource-level access. It checks whether the authenticated user's organisation ID matches the organisation that owns a given resource. Organisation IDs are auto-increment integers stored in MySQL and returned via PDO.

After a schema migration that added a new `resources` table, a handful of resources were imported with a NULL `org_id` because the ETL script didn't populate that column for legacy items. Support tickets started arriving from users who could suddenly view resources belonging to other tenants — but only the legacy imported ones.

The team added logging and confirmed that `$user_org_id` is always a valid integer for affected users. The ETL team confirmed that the NULL `org_id` rows are intentional for "global" resources, but no special handling was written for them.

## Buggy code

```php
<?php
// lib/acl.php

function can_access_resource(PDO $pdo, int $user_id, int $resource_id): bool
{
    $stmt = $pdo->prepare(
        'SELECT org_id FROM resources WHERE id = ?'
    );
    $stmt->execute([$resource_id]);
    $resource = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$resource) {
        return false; // resource doesn't exist
    }

    $stmt2 = $pdo->prepare(
        'SELECT org_id FROM users WHERE id = ?'
    );
    $stmt2->execute([$user_id]);
    $user_org_id = $stmt2->fetchColumn();

    // Allow access if user and resource belong to the same org
    return $resource['org_id'] == $user_org_id;
}
```
