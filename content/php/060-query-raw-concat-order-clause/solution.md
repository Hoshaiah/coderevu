## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Raw Input in GROUP BY Clause
// ------------------------------------------------------------------------

<?php
// reports/sales_summary.php

if (empty($_SESSION['manager_id'])) {
    http_response_code(403);
    exit;
}

$pdo = new PDO('mysql:host=localhost;dbname=erp', 'app', 'secret', [
    // CHANGE 2: Enable exception-based error handling and disable emulated prepares so PDO behaves safely and predictably.
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);

// CHANGE 1: Validate $dimension against an explicit allowlist before using it in SQL — interpolation of user input into GROUP BY/SELECT cannot be parameterised, so allowlisting is the only safe approach.
$allowed_dimensions = ['product', 'region', 'salesperson'];
$dimension = $_GET['group_by'] ?? 'product';
if (!in_array($dimension, $allowed_dimensions, true)) {
    $dimension = 'product';
}

$filter_value = $_GET['since'] ?? '2024-01-01';

$sql = "SELECT {$dimension}, SUM(amount) AS total
        FROM sales
        WHERE created_at >= ?
        GROUP BY {$dimension}
        ORDER BY total DESC
        LIMIT 50";

$stmt = $pdo->prepare($sql);
$stmt->execute([$filter_value]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($rows as $row) {
    echo htmlspecialchars($row[$dimension]) . ': ' . $row['total'] . "\n";
}
```

## Explanation

### Issue 1: Unvalidated User Input in SQL Structure

**Problem:** The `group_by` query-string parameter is interpolated directly into the `SELECT` column list and `GROUP BY` clause without any validation. An attacker sends a crafted value like `(SELECT password FROM users LIMIT 1)` and the constructed SQL executes it, leaking data in the response. Because this is structural SQL (column names, not values), PDO prepared-statement placeholders (`?`) cannot help here — placeholders only protect literal values.

**Fix:** An allowlist array `$allowed_dimensions` containing `'product'`, `'region'`, and `'salesperson'` is introduced before the SQL is built. `in_array($dimension, $allowed_dimensions, true)` (strict comparison) gates the value, and any unrecognised input falls back to `'product'`. The SQL template itself is unchanged; only the guarantee about what goes into it changes.

**Explanation:** PDO's parameterised queries bind data values — things that appear in `WHERE col = ?` positions. SQL identifiers (column names, table names, keywords) are part of the query structure itself and must be present in the string before the database parses it, so they cannot be bound as parameters. That means any identifier built from user input must be validated before interpolation. An allowlist is the right tool: it enumerates every string the code is willing to accept and rejects everything else, so there is no injection surface regardless of what the attacker sends. A denylist or regex approach is weaker because it tries to predict what is dangerous rather than what is safe.

---

### Issue 2: PDO Constructed Without Safe Error and Prepare Modes

**Problem:** The `PDO` object is created with no options array, so it uses the default error mode (`PDO::ERRMODE_SILENT`). Failed queries — including ones that fail because of the injection attempt — return `false` silently, making errors invisible during debugging and production monitoring. Emulated prepares are also on by default, which means PDO constructs the final SQL string itself rather than sending a true parameterised query to MySQL, reducing the protection `?` placeholders actually provide.

**Fix:** A fourth argument array is added to the `PDO` constructor with `PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION` and `PDO::ATTR_EMULATE_PREPARES => false`. This makes every database error throw a `PDOException` (catchable and loggable) and delegates actual query preparation to the MySQL server.

**Explanation:** With emulated prepares enabled, PDO does its own string interpolation of bound values and sends a completed SQL string to MySQL — which means the protection is only as good as PDO's escaping logic in PHP, not MySQL's native type-safe parameterisation. Disabling emulation sends the query template and the bound values to MySQL in separate protocol messages so MySQL itself enforces the boundary between code and data. Enabling exception mode matters independently: silent failures hide bugs and make it impossible to write reliable error-handling code, because every call site would need to check the return value of `prepare()` and `execute()` manually.
