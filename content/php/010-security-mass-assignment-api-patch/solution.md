## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — PATCH Endpoint Allows Role Assignment
// ------------------------------------------------------------------------

<?php
// api/users/update.php

session_start();
header('Content-Type: application/json');

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthenticated']);
    exit;
}

// CHANGE 3: Enable PDO exceptions so failures are not silently ignored and the caller gets a 500 instead of a false "updated" response.
$pdo = new PDO(
    'mysql:host=localhost;dbname=app',
    'app',
    'secret',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$body = json_decode(file_get_contents('php://input'), true) ?? [];

if (empty($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty body']);
    exit;
}

// CHANGE 1: Declare an explicit allowlist of columns users are permitted to update; any key not in this list is silently ignored, preventing role/credits escalation.
$allowed_columns = ['display_name', 'bio', 'avatar_url'];

// Build SET clause only from allowed fields
$set_parts = [];
$params    = [];
foreach ($allowed_columns as $column) {
    if (!array_key_exists($column, $body)) {
        continue;
    }
    // CHANGE 2: Cast every accepted value to string and enforce a maximum length so arrays and oversized payloads cannot corrupt the row.
    $value = substr((string) $body[$column], 0, 512);
    $set_parts[] = "`{$column}` = ?";
    $params[]    = $value;
}

if (empty($set_parts)) {
    http_response_code(400);
    echo json_encode(['error' => 'No valid fields supplied']);
    exit;
}

$params[] = $_SESSION['user_id'];

try {
    $sql  = 'UPDATE users SET ' . implode(', ', $set_parts) . ' WHERE id = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['status' => 'updated']);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error']);
}
```

## Explanation

### Issue 1: Mass Assignment via Unrestricted Column Names

**Problem:** The original code iterates directly over every key the client sends and injects it as a column name in the `UPDATE` statement. A user who sends `{"role": "admin"}` or `{"credits": 99999}` gets those columns updated in the `users` table without any check.

**Fix:** An `$allowed_columns` array (`['display_name', 'bio', 'avatar_url']`) is introduced at `CHANGE 1`. The loop now iterates over that array instead of over `$body`, so only pre-approved column names ever reach the SQL string.

**Explanation:** The root cause is that the code conflates "what the client sent" with "what the database should accept". SQL prepared statements protect against *value* injection but do nothing about *column name* injection — you cannot bind a column name as a parameter. By driving the loop from a server-side allowlist, the set of columns that can appear in the `SET` clause is fixed at deploy time. A related pitfall is that the column names are interpolated directly into the SQL string (`` `{$column}` ``), so if the allowlist ever contained a user-controlled string you would be back to SQL injection; keeping the allowlist as a hard-coded literal in source prevents that.

---

### Issue 2: No Type or Length Validation on Accepted Values

**Problem:** Even for the three permitted fields, the original code passes whatever PHP value `json_decode` produced straight into the PDO parameter. If the client sends `{"bio": ["a","b"]}`, PHP converts the array to the string `"Array"`, silently corrupting the row. An oversized string can hit column length limits and cause a silent truncation or a database error.

**Fix:** At `CHANGE 2`, each value is cast with `(string)` and then truncated to 512 characters with `substr()` before being added to `$params`. This ensures a predictable scalar type and a bounded length regardless of what the client sends.

**Explanation:** `json_decode` can return arrays, booleans, nulls, or integers depending on the JSON the client sends. PDO will coerce these to strings, but the result can be surprising (`true` becomes `"1"`, arrays become `"Array"`). Explicit casting makes the intended type visible in code and gives you a defined output for every input. The 512-character limit is illustrative — a real application should match the actual column definition in the schema. A related pitfall is forgetting to validate `avatar_url` as an actual URL; this fix does not go that far, but the cast+truncate step at least prevents the worst corruption scenarios.

---

### Issue 3: Silent Database Failure Returns False Success

**Problem:** The original code creates the PDO connection with the default error mode (`PDO::ERRMODE_SILENT`), so any failed `execute()` call returns `false` and the code immediately echoes `{"status": "updated"}` — misleading both the client and any monitoring system.

**Fix:** At `CHANGE 3`, the PDO constructor receives `[PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]`. The `execute()` call is wrapped in a `try/catch (PDOException $e)` block that returns a proper HTTP 500 with `{"error": "Database error"}` instead of a false success message.

**Explanation:** PDO's default silent mode was designed for legacy codebases; modern PHP code should always use `ERRMODE_EXCEPTION` so failures propagate visibly. Without it, a schema mismatch, a lost connection, or a constraint violation all produce the same `{"status": "updated"}` response, making bugs extremely hard to diagnose. The `catch` block deliberately does not echo `$e->getMessage()` to the client, because database error messages often contain table names, column names, or query fragments that help attackers map the schema.
