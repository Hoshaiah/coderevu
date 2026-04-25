---
slug: pdo-fetchall-memory-large-result
track: php
orderIndex: 52
title: Unbounded fetchAll on Large Table
difficulty: easy
tags:
  - queries
  - performance
  - memory
  - php
language: php
---

## Context

The nightly report script at `cron/export-audit-log.php` is run by cron at 02:00 UTC. It fetches all rows from the `audit_log` table for the previous 30 days and writes them to a gzipped CSV file on disk, which is then picked up by the compliance team. The table currently holds about 8 million rows for a 30-day window and grows by roughly 300 000 rows per day.

The cron job started failing silently about three months ago. Investigating the cron daemon logs reveals it was killed by the OOM killer mid-run. The PHP process was consuming 3-4 GB of RAM before being terminated. The CSV output file exists but is always truncated at a varying point.

The server has 4 GB of RAM total. The database team confirmed the query itself is fast (covered index on `created_at`). The problem is entirely in how PHP consumes the result set.

## Buggy code

```php
<?php
// cron/export-audit-log.php

$conn = new PDO('mysql:host=localhost;dbname=app', 'cron_user', 'secret');
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$since = date('Y-m-d H:i:s', strtotime('-30 days'));

$stmt = $conn->prepare(
    'SELECT user_id, action, target_type, target_id, ip_address, created_at
     FROM audit_log
     WHERE created_at >= ?
     ORDER BY created_at ASC'
);
$stmt->execute([$since]);

$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$out = gzopen('/var/exports/audit-' . date('Y-m-d') . '.csv.gz', 'w');

gzwrite($out, implode(',', array_keys($rows[0])) . "\n");

foreach ($rows as $row) {
    gzwrite($out, implode(',', array_map('addslashes', $row)) . "\n");
}

gzclose($out);
echo "Export complete\n";
```
