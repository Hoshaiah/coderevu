## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unbounded fetchAll on Large Table
// ------------------------------------------------------------------------

<?php
// cron/export-audit-log.php

$conn = new PDO('mysql:host=localhost;dbname=app', 'cron_user', 'secret');
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
// CHANGE 2: Disable buffered queries so MySQL streams rows to PHP on demand instead of loading the full result set into the PDO buffer before any fetch() call returns.
$conn->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);

$since = date('Y-m-d H:i:s', strtotime('-30 days'));

$stmt = $conn->prepare(
    'SELECT user_id, action, target_type, target_id, ip_address, created_at
     FROM audit_log
     WHERE created_at >= ?
     ORDER BY created_at ASC'
);
$stmt->execute([$since]);

$out = gzopen('/var/exports/audit-' . date('Y-m-d') . '.csv.gz', 'w');

$headerWritten = false;
// CHANGE 1: Replace fetchAll (which materialises all rows into one PHP array) with a row-by-row fetch() loop so only one row lives in memory at a time.
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    if (!$headerWritten) {
        gzwrite($out, implode(',', array_keys($row)) . "\n");
        $headerWritten = true;
    }
    // CHANGE 3: Replace addslashes with proper RFC-4180 CSV quoting: wrap each field in double-quotes and escape internal double-quotes by doubling them.
    $quoted = array_map(function ($value) {
        return '"' . str_replace('"', '""', (string)$value) . '"';
    }, $row);
    gzwrite($out, implode(',', $quoted) . "\n");
}

gzclose($out);
echo "Export complete\n";
```

## Explanation

### Issue 1: fetchAll Loads Entire Result Into Memory

**Problem:** The script calls `$stmt->fetchAll(PDO::FETCH_ASSOC)`, which builds a PHP array containing every matching row before a single line is written to the file. With 8 million rows averaging several hundred bytes each, this array grows to 3–4 GB, the OOM killer terminates the process, and the output file is truncated.

**Fix:** Replace `fetchAll` with a `while ($row = $stmt->fetch(PDO::FETCH_ASSOC))` loop (CHANGE 1). The header is written when the first row arrives using a `$headerWritten` flag instead of `$rows[0]`.

**Explanation:** `fetchAll` is convenient for small result sets but it asks PHP to hold every row in heap memory simultaneously. A `fetch()` loop hands the script one associative array per iteration; as soon as `gzwrite` is called, the row goes out of scope and can be garbage-collected. Peak memory usage drops from the full dataset size to roughly one row. The `$headerWritten` guard is needed because the old code relied on `$rows[0]` existing before the loop, which is no longer possible when rows arrive one at a time.

---

### Issue 2: PDO Buffered Query Negates Row-by-Row Fetching

**Problem:** Even after switching to `fetch()`, PHP's PDO MySQL driver uses buffered queries by default (`PDO::MYSQL_ATTR_USE_BUFFERED_QUERY = true`). This means the driver silently downloads the complete result set from MySQL into an internal C-level buffer before the first `fetch()` call returns. The script still allocates gigabytes of memory, just inside the extension rather than as a PHP array.

**Fix:** Set `PDO::MYSQL_ATTR_USE_BUFFERED_QUERY` to `false` on the connection before executing the query (CHANGE 2). This tells the MySQL client library to stream rows from the server on demand.

**Explanation:** Buffered mode exists to allow multiple concurrent statements on one connection and to let you call `rowCount()` reliably. For a large sequential export neither feature matters, so the cost — pre-fetching millions of rows — outweighs the benefits. In unbuffered mode MySQL sends rows over the socket only when `fetch()` requests the next one, keeping memory proportional to a single row. A related pitfall: while an unbuffered query is in-flight, you cannot open a second query on the same PDO connection; if you need lookups during the loop, open a separate `$conn2` for them.

---

### Issue 3: addslashes Does Not Produce Valid CSV

**Problem:** The original code wraps each field with `addslashes`, which escapes backslashes and single/double quotes with a preceding backslash. This is not a CSV encoding. A field containing a comma (e.g., an IP like `::1` or an action string with a comma) splits into extra columns when the file is opened in Excel or parsed by any RFC-4180 reader.

**Fix:** Replace `addslashes` with an inline closure (CHANGE 3) that wraps every field in double-quote characters and escapes any embedded double-quote by doubling it (`"` → `""`), which is the RFC-4180 standard.

**Explanation:** RFC-4180 CSV requires that a field containing a comma, double-quote, or newline be surrounded by double-quotes, and that any literal double-quote inside that field appear as two consecutive double-quotes. `addslashes` produces backslash-escaped output that most CSV parsers treat as literal backslash characters, not escape sequences. By always quoting every field (rather than only when needed), the fix is simpler and handles edge cases such as `NULL`-derived empty strings and numeric fields that happen to look like dates. Casting each value to `(string)` before encoding prevents type errors when `$value` is `null`.
