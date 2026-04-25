## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — UPDATE Without WHERE Condition
// ------------------------------------------------------------------------

<?php
// cron/expire_tokens.php

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$expiryCutoff = date('Y-m-d H:i:s', strtotime('-1 hour'));

$stmt = $pdo->prepare(
    // CHANGE 1: Added WHERE clause so only rows whose reset_token_expires_at is older than the cutoff are touched; without this every user row is updated.
    // CHANGE 2: Added the ? placeholder inside the WHERE clause so $expiryCutoff is actually bound and used by MySQL; previously it was passed to execute() but referenced nowhere in the SQL.
    'UPDATE users
     SET reset_token = NULL,
         reset_token_expires_at = NULL
     WHERE reset_token_expires_at IS NOT NULL
       AND reset_token_expires_at < ?'
);

$stmt->execute([$expiryCutoff]);

echo 'Expired ' . $stmt->rowCount() . ' tokens.' . PHP_EOL;
```

## Explanation

### Issue 1: Missing WHERE Clause on UPDATE

**Problem:** Every row in the `users` table has `reset_token` and `reset_token_expires_at` set to `NULL` each time the cron job runs. At 01:59 this affected all 84,000 users, wiping every pending password reset in the system.

**Fix:** A `WHERE reset_token_expires_at IS NOT NULL AND reset_token_expires_at < ?` clause is added to the `UPDATE` statement so that only rows with a token that has already passed the one-hour cutoff are modified.

**Explanation:** MySQL (and SQL generally) applies an `UPDATE` to every row in the table when no `WHERE` clause is present. The original code has no filter at all, so "expire old tokens" became "clear all tokens". The `IS NOT NULL` guard is also important: rows that have no token set should not be touched, and skipping them avoids unnecessary writes. A related pitfall is running this cron job during a peak signup window — without the WHERE clause even brand-new tokens issued milliseconds earlier would be destroyed.

---

### Issue 2: Placeholder Passed to execute() But Not Referenced in SQL

**Problem:** Even if the developer had intended the cutoff to filter rows, the value would have had no effect. PDO silently ignores extra values passed to `execute()` when those values have no corresponding placeholder in the prepared SQL, so `$expiryCutoff` was computed and thrown away.

**Fix:** The `?` placeholder is placed inside the new `WHERE` clause (`reset_token_expires_at < ?`), so PDO binds `$expiryCutoff` to that position when `execute([$expiryCutoff])` is called.

**Explanation:** PDO's `execute()` accepts an array that maps positionally (or by name) to `?` (or `:name`) markers in the SQL string. If there are zero markers and you pass a one-element array, PDO does not raise an error — it simply discards the value. This means the bug produced no exception or warning, making it invisible in logs until the data damage was noticed. Placing `?` at exactly the right position in the `WHERE` clause ensures MySQL receives the computed timestamp as a bound parameter, which also protects against SQL injection if the value ever came from external input.
