## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Full Table Scan on JSON Column
// ------------------------------------------------------------------------

<?php
// workers/notification_dispatch.php

$pdo = new PDO('mysql:host=localhost;dbname=app', 'worker', 'secret', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$type = 'marketing'; // dispatched type; could also be 'digest', etc.

// CHANGE 1: Before running this script, create a generated column + index in MySQL so JSON_EXTRACT can be resolved via a B-tree index instead of a full table scan. Run once in a migration: ALTER TABLE users ADD COLUMN pref_marketing TINYINT(1) AS (JSON_EXTRACT(preferences, '$.marketing')) VIRTUAL, ADD INDEX idx_pref_marketing_active (pref_marketing, active); (Repeat for each notification type you need to filter on.) The query below references the generated column directly so MySQL uses the index.

// CHANGE 2: Whitelist $type before using it in SQL to prevent SQL injection; reject any value not in the known set.
$allowed = ['marketing', 'digest', 'alerts'];
if (!in_array($type, $allowed, true)) {
    throw new \InvalidArgumentException("Unknown notification type: $type");
}

// Build the generated column name deterministically from the whitelisted $type value.
$column = 'pref_' . $type; // safe because $type is whitelisted above

// CHANGE 1 (query site): Reference the generated column instead of JSON_EXTRACT so the index is used.
$stmt = $pdo->prepare(
    "SELECT id, email
     FROM users
     WHERE {$column} = 1
     AND active = 1"
);
$stmt->execute();

// CHANGE 3: Iterate with fetch() inside a loop instead of fetchAll() to avoid loading all rows into memory at once.
while ($user = $stmt->fetch(PDO::FETCH_ASSOC)) {
    // dispatch_push_notification($user['id'], $type);
    echo "Dispatching to user {$user['id']}\n";
}
```

## Explanation

### Issue 1: Full Table Scan on JSON Column

**Problem:** The query calls `JSON_EXTRACT(preferences, '$.marketing')` directly in the `WHERE` clause. MySQL has no index that covers this expression, so the storage engine reads every row in the `users` table to evaluate it. At 800k rows the query takes 12–18 seconds and the cron job times out.

**Fix:** A MySQL generated (virtual) column named `pref_marketing` is added via a one-time migration, defined as `JSON_EXTRACT(preferences, '$.marketing')`. A composite B-tree index on `(pref_marketing, active)` is added alongside it. The query is rewritten to `WHERE pref_marketing = 1 AND active = 1` so MySQL resolves the filter through the index instead of scanning every row.

**Explanation:** MySQL's query optimiser can only use a B-tree index on a column that physically exists (or is defined as a generated column) in the schema. A bare function call like `JSON_EXTRACT(...)` in a `WHERE` clause is opaque to the optimiser, which has no precomputed values to look up — it must call the function for each row. A virtual generated column stores the expression's definition in the schema; MySQL automatically evaluates it during writes and keeps a corresponding index up to date. When the query references the column name directly, the optimiser sees a normal indexed column and uses a range or ref scan. The migration must be repeated for each notification type you filter on (`pref_digest`, `pref_alerts`, etc.).

---

### Issue 2: SQL Injection via String Interpolation

**Problem:** `$type` is concatenated directly into the SQL string with `'$." . $type . "'`. If anything external can influence `$type` — a config file, a command-line argument, a future refactor that reads it from a request — an attacker can inject arbitrary SQL. The symptom in production is silent: the code works fine until `$type` is not what you expect.

**Fix:** An explicit allowlist array `$allowed` is introduced. `in_array($type, $allowed, true)` is checked before `$type` is used anywhere in the SQL string, and an exception is thrown for any unknown value. The generated column name `$column` is then constructed from the whitelisted value, keeping the query free of user-controlled input.

**Explanation:** PDO prepared statements with `?` placeholders protect literal values (strings, integers) but cannot parameterise identifiers like column names or table names. Because a column name must be embedded as raw SQL text, the only safe approach is a whitelist that maps acceptable logical values to known safe identifier fragments. The strict `true` third argument to `in_array` prevents type-juggling bypasses (e.g., `0 == 'marketing'` in loose comparison). Any value not in the list raises an exception immediately, making the failure loud and early rather than a silent SQL error or data leak.

---

### Issue 3: Entire Result Set Loaded into Memory

**Problem:** `$stmt->fetchAll()` retrieves every qualifying user row into a single PHP array before the `foreach` loop begins. If 50,000 users have `marketing = true`, all 50,000 rows sit in memory simultaneously. PHP's memory limit can be hit, or the process RSS grows large enough to cause OOM kills on the cron host.

**Fix:** `fetchAll()` and the `foreach` are replaced with a `while` loop calling `$stmt->fetch(PDO::FETCH_ASSOC)`. The result set is consumed one row at a time, keeping memory usage proportional to a single row rather than the full result.

**Explanation:** PDO by default buffers the entire result set from MySQL into the PHP process when using the `mysql` or `pdo_mysql` driver in buffered query mode. `fetchAll()` then copies that buffer into a PHP array, doubling the peak memory. Switching to `fetch()` in a loop does not automatically switch to unbuffered queries (you would need `PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false` for that), but it does avoid the second full-array copy and lets you process and discard each row before the next is needed. For very large result sets, combining `fetch()` with `PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false` gives the maximum memory saving, at the cost of not being able to issue other queries on the same connection until the cursor is exhausted.
