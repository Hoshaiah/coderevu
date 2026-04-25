---
slug: queries-delete-missing-limit-batch
track: php
orderIndex: 62
title: Unbounded DELETE Locks Table
difficulty: medium
tags:
  - queries
  - performance
  - locking
  - mysql
language: php
---

## Context

This is `src/Jobs/PurgeExpiredSessions.php`, a background worker that runs every hour via a cron job. Its purpose is to delete rows from the `sessions` table where the `expires_at` timestamp is in the past. The `sessions` table is shared with the live application — every authenticated request reads from it.

Operations noticed that every night around 02:00 the application becomes unresponsive for 30–90 seconds. Slow query logs show a `DELETE FROM sessions WHERE expires_at < NOW()` holding an exclusive table lock. The `sessions` table has grown to over 4 million rows, and hundreds of thousands expire each night.

A developer added an index on `expires_at` but the outage persists. The index helps the query find matching rows, but does not solve the underlying problem.

## Buggy code

```php
<?php
// src/Jobs/PurgeExpiredSessions.php

require_once __DIR__ . '/../../src/db.php';

function purgeExpiredSessions(PDO $pdo): void
{
    $stmt = $pdo->prepare(
        "DELETE FROM sessions WHERE expires_at < NOW()"
    );
    $stmt->execute();

    $deleted = $stmt->rowCount();
    error_log("[PurgeExpiredSessions] Deleted {$deleted} expired sessions.");
}

purgeExpiredSessions($pdo);
```
