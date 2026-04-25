## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Raw IDs Concatenated Into IN Clause
// ------------------------------------------------------------------------

<?php
// api/BulkExport.php

require_once 'db.php';
require_once 'auth.php';

requireAuth();

$rawIds = $_GET['ids'] ?? '';
// e.g. "12,45,78"

if (empty($rawIds)) {
    echo json_encode([]);
    exit;
}

// CHANGE 2: Split input and keep only values that are strictly integer-shaped, discarding anything else entirely.
$ids = array_filter(
    array_map('trim', explode(',', $rawIds)),
    fn($v) => ctype_digit($v) && $v !== ''
);

// CHANGE 2: If filtering left us with nothing (all values were non-numeric), return empty rather than running a broken query.
if (empty($ids)) {
    echo json_encode([]);
    exit;
}

// CHANGE 1: Build a parameterised IN clause with one `?` placeholder per ID so no user value is ever interpolated into SQL.
$placeholders = implode(',', array_fill(0, count($ids), '?'));
$sql = "SELECT id, customer_name, total, created_at FROM orders WHERE id IN ($placeholders)";

// CHANGE 1: Use a prepared statement and bind the validated integer values — PDO handles quoting and type safety internally.
$stmt = $pdo->prepare($sql);
$stmt->execute(array_values($ids));
$orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($orders);
```

## Explanation

### Issue 1: SQL Injection via Concatenated IN Clause

**Problem:** The original code takes the raw `ids` string from `$_GET` and drops it straight into the SQL string: `WHERE id IN ($rawIds)`. Any attacker who controls that query parameter can inject arbitrary SQL. The auditor's payload `,0 UNION SELECT username,password,3,4,5 FROM admins--` turns the query into a UNION attack that returns admin credentials in the JSON response.

**Fix:** Replace `$pdo->query($sql)` with `$pdo->prepare($sql)` and `$stmt->execute(array_values($ids))`. The SQL string now contains only `?` placeholders built with `array_fill` and `implode`, and PDO binds each value separately so user input never touches the SQL text.

**Explanation:** Prepared statements work by sending the SQL structure to the database first, then sending parameter values in a separate step. Because the database already knows the full shape of the query before it sees any user data, it treats every bound value as a literal datum — not as SQL syntax. A payload like `0 UNION SELECT ...` becomes a string the database tries to cast to an integer for the `IN` comparison; it cannot alter query structure. The variable-length nature of `IN` is handled by generating exactly as many `?` tokens as there are IDs and passing the values array to `execute()`.

---

### Issue 2: No Validation That IDs Are Integers

**Problem:** Even with parameterised queries, sending non-numeric strings as IDs (e.g. `"abc"`, `"12abc"`, or an empty segment from a trailing comma) produces meaningless queries and may trigger database warnings or unexpected type-coercion behaviour. Without filtering, those values reach the database engine.

**Fix:** After splitting on commas, each segment is trimmed and then checked with `ctype_digit()`. Values that fail the check are dropped by `array_filter`. If every segment fails, the code exits early with an empty JSON array before preparing any statement.

**Explanation:** `ctype_digit()` returns `true` only when every character in the string is a decimal digit (0–9), which is exactly the shape of a positive integer primary key. It rejects empty strings, strings with spaces, negative numbers written as `-5`, and any alphanumeric garbage. Casting with `(int)` alone would silently convert `"45abc"` to `45`, which is a hidden correctness bug — the user asked for ID `"45abc"` which does not exist, but the code would query for `45`. Explicit digit-only validation makes the contract clear and avoids that silent coercion. The early-exit guard prevents the `array_fill(0, 0, '?')` edge case that would produce an invalid `IN ()` clause if all IDs were filtered out.
