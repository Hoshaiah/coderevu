## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unfiltered POST Fields Updated Blindly
// ------------------------------------------------------------------------

<?php
// api/account/update.php

require __DIR__ . '/../../auth.php';   // sets $current_user_id or 401s
require __DIR__ . '/../../db.php';     // provides $pdo

header('Content-Type: application/json');

$body   = json_decode(file_get_contents('php://input'), true) ?? [];

if (empty($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'No fields provided']);
    exit;
}

// CHANGE 1: Declare an explicit whitelist of columns the user is allowed to update; any key not in this list is silently dropped, preventing privilege escalation via fields like `role` or `credits`.
$allowed_fields = ['display_name', 'bio', 'timezone'];

// Build SET clause from whatever the client sends
$set_parts = [];
$params    = [];
// CHANGE 2: Filter $body to only keys present in $allowed_fields before iterating, so no attacker-controlled string ever reaches the SQL template; also removes the SQL-injection risk from interpolated column names.
foreach (array_intersect_key($body, array_flip($allowed_fields)) as $col => $val) {
    $set_parts[] = "`$col` = ?";
    $params[]    = $val;
}

// CHANGE 3: After filtering, verify at least one allowed field was supplied; without this check a request containing only disallowed fields would produce an empty SET clause and a SQL syntax error.
if (empty($set_parts)) {
    http_response_code(400);
    echo json_encode(['error' => 'No valid fields provided']);
    exit;
}

$params[] = $current_user_id;
$sql = "UPDATE users SET " . implode(', ', $set_parts) . " WHERE id = ?";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

echo json_encode(['ok' => true]);
```

## Explanation

### Issue 1: Missing Field Whitelist

**Problem:** The loop iterates over every key in the decoded JSON body and adds it to the `SET` clause. A user who sends `{"role": "admin"}` or `{"credits": 99999}` gets those columns updated in the database. The API being authenticated does not prevent a legitimate user from abusing it against their own row.

**Fix:** An `$allowed_fields` array listing `'display_name'`, `'bio'`, and `'timezone'` is added before the loop. `array_intersect_key` filters `$body` down to only those keys before the `foreach` ever runs.

**Explanation:** The root cause is trusting the client to send only the keys the UI exposes. Any HTTP client can craft an arbitrary JSON body. By declaring `$allowed_fields` centrally, the enforcement lives in one place and is easy to audit. When a new column should be user-editable, a developer adds it to the whitelist deliberately — an intentional gate rather than an accidental omission. A related pitfall is relying on front-end validation to restrict which fields are sent; the back end must always enforce its own constraints independently.

---

### Issue 2: SQL Injection via Column Name Interpolation

**Problem:** The `$col` variable comes directly from attacker-controlled JSON keys and is interpolated into the SQL string as `` `$col` = ? ``. A key like `` `id`=1 OR 1=1-- `` or a key containing a backtick can break out of the intended SQL structure. PDO's prepared-statement placeholder `?` only parameterises values, not identifiers.

**Fix:** The `array_intersect_key` call from CHANGE 2 ensures `$col` can only ever be one of the strings in `$allowed_fields`. Since those strings are hard-coded by the developer, they are safe to interpolate as column identifiers.

**Explanation:** PDO parameterisation protects column *values* by binding them separately from the query structure. Column *names* must be validated by the application because SQL has no placeholder syntax for identifiers. After the `array_intersect_key` filter, every string that reaches the interpolation is one of three literals controlled by the developer, not by the client. If the allowed set were larger or dynamically sourced, additional escaping (e.g. checking against a regex `[a-z_]+`) would be a worthwhile extra layer.

---

### Issue 3: Empty SET Clause After Filtering

**Problem:** If a client sends only disallowed fields (e.g. `{"role": "admin"}`), `array_intersect_key` returns an empty array, `$set_parts` stays empty, and the constructed SQL becomes `UPDATE users SET  WHERE id = ?` — a syntax error. PDO throws an exception (or silently fails depending on error mode), and the caller may receive a confusing 500 or a misleading `{"ok": true}`.

**Fix:** An `empty($set_parts)` check is inserted after the loop. When no allowed fields remain, the endpoint responds with HTTP 400 and `{"error": "No valid fields provided"}` and calls `exit` before the SQL is constructed.

**Explanation:** The original code already handles a completely empty body at the top of the file, but that check runs before filtering. After filtering, a non-empty body can produce an empty work set. Checking `$set_parts` after the loop catches exactly this case. Returning 400 is correct here because the request is malformed from the API's perspective — it contains no actionable fields — and it gives the caller a clear signal without leaking internal details about which columns exist.
