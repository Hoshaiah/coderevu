## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Temp File Path Disclosed to Client
// ------------------------------------------------------------------------

<?php
// export/generate.php

session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    exit('Unauthorised');
}

$pdo = new PDO('mysql:host=localhost;dbname=app', 'app', 'secret');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$from = $_GET['from'] ?? date('Y-m-01');
$to   = $_GET['to']   ?? date('Y-m-t');

$stmt = $pdo->prepare(
    'SELECT order_id, amount, created_at FROM orders
     WHERE created_at BETWEEN ? AND ?'
);
$stmt->execute([$from, $to]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// CHANGE 2: Return 404 with a plain message when no rows exist instead of sending an empty 200 body.
if (empty($rows)) {
    http_response_code(404);
    exit('No sales data found for the selected date range.');
}

// CHANGE 1: Use php://temp (an in-memory/swap stream) instead of a named file in /tmp, so no filesystem path ever exists to be leaked.
$fh = fopen('php://temp', 'w+');

// CHANGE 3: Use fputcsv() to write each row so that values containing commas, quotes, or newlines are properly RFC-4180 escaped.
fputcsv($fh, ['order_id', 'amount', 'created_at']);
foreach ($rows as $row) {
    // CHANGE 3: fputcsv handles quoting automatically; replaces manual implode() concatenation.
    fputcsv($fh, array_values($row));
}

rewind($fh);

header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="sales_export.csv"');
// CHANGE 1: Stream from the in-memory handle directly; no tmpPath variable exists so no path can appear in any error message.
stream_copy_to_stream($fh, fopen('php://output', 'w'));
fclose($fh);
```

## Explanation

### Issue 1: Temp File Path Leaked to Client

**Problem:** The script calls `tempnam(sys_get_temp_dir(), 'export_')` which creates a real file like `/tmp/export_A3f9Bk`. If any PHP error fires after that point — or if `display_errors` is `On` — the full path appears in the HTTP response. Even without display errors, a crafted exception message in a catch block would expose it. An attacker who sees the path can race to read `/tmp/export_A3f9Bk` before `unlink()` runs, since `/tmp` is world-readable on Linux.

**Fix:** Replace `tempnam()`/`fopen`/`readfile`/`unlink` with `fopen('php://temp', 'w+')` and `stream_copy_to_stream($fh, fopen('php://output', 'w'))`. The variable `$tmpPath` is removed entirely, so no path string exists in any variable that could end up in an error message.

**Explanation:** `php://temp` is a PHP stream wrapper that buffers data in memory up to 2 MB, then spills to a kernel-managed anonymous temporary file — one that has no directory entry visible to other processes after it is opened. Because no named path is involved, there is nothing to leak. `stream_copy_to_stream` moves bytes from the rewound in-memory handle straight to `php://output` (the response body) without creating any intermediate file. This also eliminates the `unlink()` call: the resource is freed when `fclose()` is called or when the script exits. A related pitfall: even if you keep a named temp file, setting `display_errors = Off` alone is not sufficient — structured error logging or a custom exception handler could still include the path in a logged response body.

---

### Issue 2: Empty Result Returns HTTP 200 With No Body

**Problem:** When the date range matches no orders, `$rows` is an empty array. The script still writes only the header line to the temp stream, sends `Content-Type: text/csv` with HTTP 200, and streams a one-line file. The browser or API client receives a success status with what looks like an empty export, giving no indication that the query produced zero results. This confuses the finance frontend into thinking the export succeeded.

**Fix:** Add an `empty($rows)` check immediately after `fetchAll()`. When true, call `http_response_code(404)` and `exit()` with a human-readable message before any output is written.

**Explanation:** HTTP 200 means the request was fulfilled as expected. Sending it with a content-free body forces every downstream consumer — the browser, any automated importer, a logging proxy — to treat silence as success. A 404 (or 204 with a header, depending on your API contract) signals that the resource does not exist for the given parameters. The frontend can then show the user a meaningful message rather than an empty download. The check must happen before `fopen('php://temp')` so that no partial work is done before the early exit.

---

### Issue 3: CSV Values Not Escaped

**Problem:** The original code uses `implode(',', $row)` to build each CSV line. If any field — `amount` with a locale-formatted value, or `created_at` with an unexpected format — contains a comma, the resulting file has the wrong number of columns. A value containing a double-quote or a newline would break RFC-4180 parsing in Excel and most import tools silently.

**Fix:** Replace `fwrite($fh, implode(',', $row) . "\n")` and the header `fwrite` with `fputcsv($fh, ['order_id', 'amount', 'created_at'])` and `fputcsv($fh, array_values($row))` inside the loop.

**Explanation:** `fputcsv` wraps fields that contain the delimiter, the enclosure character, or line endings in double-quotes and escapes internal double-quotes by doubling them, exactly as RFC 4180 requires. The manual `implode` approach produces valid output only when you control every possible value and can guarantee none of them contain commas — a guarantee you cannot make for database-sourced data in general. `array_values()` is used to strip associative keys so `fputcsv` receives a plain indexed array, which is required for correct column ordering.
