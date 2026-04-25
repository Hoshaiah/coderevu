## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unbounded IN Clause from User List
// ------------------------------------------------------------------------

<?php
// admin/bulk_notify.php

$pdo = new PDO('mysql:host=localhost;dbname=app', 'admin', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$raw_ids = $_POST['user_ids'] ?? '';
$message = $_POST['message'] ?? '';

// CHANGE 1: Filter every element to a positive integer and discard anything that is not numeric, removing all SQL injection vectors from the list.
$id_list = array_values(array_filter(array_map('intval', explode(',', $raw_ids)), fn($v) => $v > 0));

// CHANGE 2: Cap the number of IDs to 500 to prevent unbounded IN clauses that cause slow query log entries and locking contention on large inputs.
$id_list = array_slice($id_list, 0, 500);

if (empty($id_list)) {
    echo 'No valid user IDs provided';
    exit;
}

// CHANGE 1: Build one named placeholder per ID and bind each value individually so the query is fully parameterized rather than interpolated.
$placeholders = implode(',', array_fill(0, count($id_list), '?'));
$sql = "SELECT id, email FROM users WHERE id IN ($placeholders)";
$stmt = $pdo->prepare($sql);
$stmt->execute($id_list);
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($users as $user) {
    mail($user['email'], 'Important notice', $message);
}

echo 'Notified ' . count($users) . ' users';
```

## Explanation

### Issue 1: SQL Injection via Unvalidated IN Values

**Problem:** The original code calls `explode` and `implode` on the raw POST string but never checks whether each segment is actually an integer. A staffer or an XSS payload on the admin UI can submit a value like `1,2) UNION SELECT id,password FROM users--`, which gets interpolated verbatim into the query string and executed by MySQL.

**Fix:** Replace the `implode/explode` round-trip with `array_map('intval', ...)` to coerce every token to an integer, then `array_filter` to drop zeroes, and finally build the query using `prepare`/`execute` with `?` positional placeholders — one per ID — instead of string interpolation.

**Explanation:** The root cause is that `$id_list` is built by string manipulation and then dropped directly into the SQL source with `"WHERE id IN ($id_list)"`. PDO's `query()` receives a fully-formed string, so it has no opportunity to separate code from data. Casting with `intval` means the worst a malicious token can produce is the integer `0`, which `array_filter` then removes. The prepared statement with positional placeholders ensures MySQL always treats the bound values as data scalars, not SQL syntax, regardless of their content.

---

### Issue 2: Unbounded IN Clause Causing Slow Queries

**Problem:** Support staff paste full CSV exports containing thousands of IDs. MySQL's query planner handles short IN lists efficiently, but lists with hundreds or thousands of elements cause it to switch to full table scans and hold row locks longer, which the database team observed as slow-query-log entries and locking contention during peak hours.

**Fix:** After building the validated integer array, add `array_slice($id_list, 0, 500)` to hard-cap the list at 500 IDs before the query is constructed or executed.

**Explanation:** MySQL evaluates each element in an IN list separately during the range optimization pass. Beyond a few hundred elements the optimizer's cost estimates become unreliable and it can abandon the index entirely, falling back to a sequential scan. A hard cap at 500 keeps the list inside the range where index range scans remain reliable. If a workflow genuinely requires notifying more than 500 users at once, the correct pattern is to break the input into batches and issue one query per batch inside a loop, rather than sending a single enormous IN clause.
