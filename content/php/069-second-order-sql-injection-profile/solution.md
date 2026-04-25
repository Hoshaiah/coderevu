## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Stored Input Injected Into Later Query
// ------------------------------------------------------------------------

<?php
// admin/reports/user_activity.php
// Requires: admin session already validated above this snippet.

require __DIR__ . '/../../db.php'; // provides $conn (mysqli)

$user_id = (int) $_GET['user_id'];

// CHANGE 2: Use a prepared statement for the first query so the integer param is never concatenated raw into SQL, making the pattern consistent and safe even if the int cast is removed later.
$stmt1 = mysqli_prepare($conn, "SELECT username FROM users WHERE id = ?");
mysqli_stmt_bind_param($stmt1, 'i', $user_id);
mysqli_stmt_execute($stmt1);
$res  = mysqli_stmt_get_result($stmt1);
$user = mysqli_fetch_assoc($res);
mysqli_stmt_close($stmt1);

if (!$user) {
    http_response_code(404);
    exit('User not found.');
}

$username = $user['username'];

// CHANGE 1: Use a prepared statement for the audit_log query so the username value is bound as a parameter and never interpolated into the SQL string, preventing second-order SQL injection regardless of what is stored in the database.
$stmt2 = mysqli_prepare($conn, "SELECT action, created_at FROM audit_log
               WHERE actor_username = ?
               ORDER BY created_at DESC
               LIMIT 200");
mysqli_stmt_bind_param($stmt2, 's', $username);
mysqli_stmt_execute($stmt2);
$log_result = mysqli_stmt_get_result($stmt2);

$rows = [];
while ($row = mysqli_fetch_assoc($log_result)) {
    $rows[] = $row;
}
mysqli_stmt_close($stmt2);

header('Content-Type: application/json');
echo json_encode($rows);
```

## Explanation

### Issue 1: Second-order SQL injection via stored username

**Problem:** An attacker renames their account to a SQL fragment such as `' OR '1'='1`. `mysqli_real_escape_string()` on the write path only prevents injection into the UPDATE query; MySQL stores the literal value without escape characters. When an admin later loads the activity report, the code reads that value back and concatenates it directly into the `audit_log` SELECT. The stored payload now executes with no escaping at all.

**Fix:** Replace the string-interpolated `$log_query` with a `mysqli_prepare()` call using a `?` placeholder, then bind `$username` via `mysqli_stmt_bind_param($stmt2, 's', $username)` before executing. The username is transmitted to the database engine as data, not as part of the SQL text.

**Explanation:** SQL injection via a stored value is called second-order because the dangerous data enters through one request (the profile update) and fires through a completely different request (the admin report). Escaping on write does not help because MySQL strips the escape characters when it stores the value; the injected SQL fragment sits clean in the `users` row. When that clean value is later concatenated into a new query string, the database parser sees it as SQL syntax, not as a quoted string. Prepared statements solve this at the protocol level: the query template is parsed once, and the bound value is sent in a separate binary channel that the parser never interprets as SQL. A related pitfall is assuming that data originating from your own database is inherently safe — any value that was originally user-supplied must be treated as untrusted every time it touches a new query.

---

### Issue 2: Raw integer concatenation in first query

**Problem:** The first query is built as `"SELECT username FROM users WHERE id = $user_id"`. Although `(int)` currently coerces the value, this pattern is one refactor away from injection: if someone removes the cast, passes the raw `$_GET` value through a helper, or changes the type, the query becomes directly injectable through the `user_id` parameter.

**Fix:** Replace the concatenated query with `mysqli_prepare($conn, "SELECT username FROM users WHERE id = ?")` and bind `$user_id` with type `'i'` via `mysqli_stmt_bind_param($stmt1, 'i', $user_id)`. The integer is now passed as a bound parameter rather than embedded in the SQL string.

**Explanation:** Relying on a type cast for SQL safety is a fragile defence. The cast works today, but it is an implicit contract that future maintainers may not recognise. Prepared statements make the contract explicit in the code structure itself: there is no string to inject into because the query template contains only a placeholder. Using consistent parameterisation across every query in a file also sets a clear pattern — it prevents a future developer from copying the concatenation style to a nearby query where the cast is forgotten. Using `'i'` binding also means the database engine enforces integer type independently of PHP, adding a second layer of validation.
