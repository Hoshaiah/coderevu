## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unescaped Wildcards in LIKE Clause
// ------------------------------------------------------------------------

<?php
// search/products.php

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', 'password');
// CHANGE 2: Enable exception mode so PDO errors throw instead of silently returning false/empty results.
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$term = $_GET['q'] ?? '';

// CHANGE 1: Escape LIKE special characters `%`, `_`, and `\` in the user input before embedding it in the LIKE pattern, so literal characters are matched rather than treated as wildcards.
$escapedTerm = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $term);

$stmt = $pdo->prepare(
    'SELECT id, name, price FROM products WHERE name LIKE ? LIMIT 50'
);
$stmt->execute(["%{$escapedTerm}%"]);
$products = $stmt->fetchAll(PDO::FETCH_ASSOC);

header('Content-Type: application/json');
echo json_encode($products);
```

## Explanation

### Issue 1: Unescaped LIKE Wildcards in User Input

**Problem:** When a user searches for `%` the query becomes `LIKE '%%'`, which matches every row in the table. When they search for `AB_200` the `_` matches any single character, so products like `AB1200` and `AB-200` also appear in results.

**Fix:** Before building the pattern string, pass `$term` through `str_replace` to prefix `%`, `_`, and `\` with a backslash escape (MySQL's default LIKE escape character), producing `$escapedTerm`. The `execute` call then uses `"%{$escapedTerm}%"` instead of `"%{$term}%"`.

**Explanation:** PDO prepared statements protect against SQL injection by separating the query structure from the data value, but the data value is still interpreted by MySQL's `LIKE` engine once it arrives. `%` means "any sequence of characters" and `_` means "any single character" inside a `LIKE` pattern regardless of how the value was bound. Escaping those characters with a backslash tells MySQL to treat them as literals. The backslash itself must also be escaped first — hence replacing `\` before `%` and `_` — otherwise a user input of `50\%` would produce a broken escape sequence. If you ever switch databases or change the LIKE escape character via `ESCAPE` clause, the escaping logic must match.

---

### Issue 2: No PDO Error Mode Configured

**Problem:** By default PDO uses `ERRMODE_SILENT`, meaning a failed `prepare` or `execute` returns `false` rather than throwing. The code then calls `fetchAll` on `false`, which either emits a PHP warning or returns an empty array, and the API silently responds with `[]` instead of an error the caller can act on.

**Fix:** Add `$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION)` immediately after constructing the PDO instance, so any database-level failure throws a `PDOException` that can be caught or logged.

**Explanation:** Silent failure makes debugging hard: a typo in the DSN, a lost connection, or a schema mismatch all look identical to "no results found". With `ERRMODE_EXCEPTION`, the failure propagates immediately with a meaningful message and stack trace. A production application would wrap the PDO calls in a try/catch to return a proper HTTP 500 with a safe error message rather than leaking exception details to the client, but the first step is making the error visible at all.
