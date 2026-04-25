## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — CSV export loads the entire result set into memory, causing OOM on large tables
// ------------------------------------------------------------------------
<?php
// reports/export_orders.php

session_start();
if (empty($_SESSION['admin_id'])) {
    http_response_code(403);
    exit;
}

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', getenv('DB_PASSWORD'));
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
// CHANGE 1: Enable unbuffered queries so MySQL streams rows one at a time instead of collecting the full result set in memory before returning control.
$pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);

// CHANGE 3: Validate and sanitise date inputs before use. strtotime + date normalises any recognisable date string and rejects garbage.
$fromRaw = $_GET['from'] ?? date('Y-m-01');
$toRaw   = $_GET['to']   ?? date('Y-m-d');
$from = date('Y-m-d', strtotime($fromRaw) ?: time());
$to   = date('Y-m-d', strtotime($toRaw)   ?: time());

$stmt = $pdo->prepare(
    'SELECT id, customer_email, total_cents, status, created_at
     FROM orders
     WHERE created_at BETWEEN ? AND ?'
);
$stmt->execute([$from, $to]);
// CHANGE 1 (continued): fetch() in a loop replaces fetchAll() so only one row
// lives in memory at a time; the result set is consumed row-by-row.

// CHANGE 2: Turn off any active output buffers so the CSV bytes are written directly to the SAPI output stream rather than accumulated in a buffer.
while (ob_get_level() > 0) {
    ob_end_clean();
}

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="orders.csv"');

$out = fopen('php://output', 'w');
fputcsv($out, ['ID', 'Email', 'Total (cents)', 'Status', 'Created At']);

// CHANGE 1 (continued): iterate with fetch() instead of a pre-loaded array.
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    fputcsv($out, $row);
}

fclose($out);
```

## Explanation

### Issue 1: Full result set loaded into memory

**Problem:** `fetchAll()` tells PDO to retrieve every matching row from MySQL and store it as a PHP array before the script touches a single row. When the date range spans weeks of a high-volume orders table, this array can easily exceed the 512 MB PHP-FPM memory limit, killing the process before any CSV bytes reach the client.

**Fix:** Replace `fetchAll()` and the pre-loaded `$rows` array with `PDO::MYSQL_ATTR_USE_BUFFERED_QUERY` set to `false` and a `while ($row = $stmt->fetch(PDO::FETCH_ASSOC))` loop. With unbuffered queries, MySQL streams one row at a time to PHP; the script holds at most one row in memory regardless of result set size.

**Explanation:** By default, the MySQL PDO driver uses buffered queries: it asks MySQL for all rows, waits for the full transfer, and stores them in the client-side C buffer before `execute()` returns. `fetchAll()` then copies that buffer into a PHP array, doubling the peak memory cost. Switching to `PDO::MYSQL_ATTR_USE_BUFFERED_QUERY = false` tells the driver to leave rows on the MySQL side and pull them one at a time on each `fetch()` call. The trade-off is that you cannot issue a second prepared statement on the same connection until the first cursor is fully consumed or closed — but for a single-query export script this is not a problem. Forgetting to set the attribute but switching to `fetch()` alone does not help, because the buffered driver still transferred the entire result to the PHP process on `execute()`.

---

### Issue 2: Output buffers silently accumulate streamed CSV

**Problem:** PHP-FPM or a framework bootstrap may have started one or more output buffers before this script runs. Even after the row-by-row fix, every `fputcsv` write lands in that buffer rather than being flushed to the network, re-introducing memory growth proportional to the full output size.

**Fix:** Add a `while (ob_get_level() > 0) { ob_end_clean(); }` loop immediately before the `header()` calls. This drains and discards every active buffer so subsequent writes go straight to the SAPI output stream.

**Explanation:** `ob_end_clean()` both flushes any buffered content (discarding it, since we have not written real output yet) and decreases the buffer nesting level by one. The `while` loop repeats until `ob_get_level()` returns zero, handling arbitrarily nested buffers started by frameworks or `auto_prepend_file` scripts. If you called `ob_end_flush()` instead, the previously buffered content (e.g., session cookie headers written by `session_start`) would be sent as plain text before the CSV headers, corrupting the download. Discarding with `ob_end_clean()` is safe here because the only output before this point is HTTP headers, which are not captured by output buffers.

---

### Issue 3: Unvalidated date inputs passed to the query

**Problem:** `$_GET['from']` and `$_GET['to']` are used directly as bind parameters without any format check. A value like `2024-01-01 00:00:00` or a very large range string could produce unexpected query behaviour or bypass intended access controls enforced by the date filter.

**Fix:** Pass each raw input through `strtotime()` and reformat with `date('Y-m-d', ...)`. If `strtotime()` returns `false` (unparseable input), the expression falls back to `time()`, giving today's date rather than exposing an error or a wildcard.

**Explanation:** PDO parameterised queries protect against SQL injection, so the risk here is not direct injection but rather logical bypass: a carefully crafted date string could shift the `BETWEEN` range to export far more data than the admin intended, or expose orders outside their authorised scope if multi-tenant logic depends on the date filter. Normalising through `strtotime` + `date('Y-m-d')` ensures the value passed to MySQL is always a clean `YYYY-MM-DD` string. A related pitfall is that `strtotime('0')` returns `0` (the Unix epoch, 1970-01-01), which is technically valid — if you need to reject implausible dates you should add an explicit range check after normalisation.
