## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — XML order importer processes uploaded files without disabling external entities
// ------------------------------------------------------------------------
<?php
// warehouse/import_orders.php

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$tmpPath = $_FILES['order_xml']['tmp_name'];
if (!$tmpPath || !is_uploaded_file($tmpPath)) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded']);
    exit;
}

$xmlContent = file_get_contents($tmpPath);

// CHANGE 1: Disable external entity loading before parsing to prevent XXE. libxml_disable_entity_loader(true) is the pre-PHP-8.0 guard; on PHP 8.0+ external entity loading is already disabled by default, but calling it here keeps the code safe on PHP 7.x deployments.
if (LIBXML_VERSION < 20900) {
    libxml_disable_entity_loader(true);
}

// CHANGE 2: Use libxml_use_internal_errors so libxml parse warnings are captured internally instead of emitted as PHP warnings (which may reveal server paths). Clear any previous errors first.
libxml_use_internal_errors(true);
libxml_clear_errors();

// CHANGE 1 (continued): Pass LIBXML_NONET to forbid network-based entity
// retrieval, and LIBXML_NOENT is intentionally NOT passed so entity
// substitution stays off.
$xml = simplexml_load_string($xmlContent, 'SimpleXMLElement', LIBXML_NONET);

if ($xml === false) {
    // CHANGE 2 (continued): Consume libxml errors internally; return a
    // generic message so internal details are not leaked to the caller.
    libxml_clear_errors();
    http_response_code(422);
    echo json_encode(['error' => 'Invalid XML']);
    exit;
}

// CHANGE 3: Set PDO to throw exceptions on errors so insert failures are not silently swallowed.
$pdo = new PDO(
    'mysql:host=localhost;dbname=shop',
    'app',
    getenv('DB_PASSWORD'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

foreach ($xml->order as $order) {
    $stmt = $pdo->prepare(
        'INSERT INTO purchase_orders (supplier, sku, qty) VALUES (?, ?, ?)'
    );
    $stmt->execute([
        (string) $order->supplier,
        (string) $order->sku,
        (int)    $order->qty,
    ]);
}

echo json_encode(['imported' => $xml->order->count()]);
```

## Explanation

### Issue 1: XXE allows arbitrary file read

**Problem:** An attacker uploads XML containing a DOCTYPE declaration that defines an external entity pointing at a local file such as `/etc/passwd`. When `simplexml_load_string` parses the document, libxml resolves the entity and substitutes the file contents into the XML tree. The application then reads and may echo that content back, or it can be exfiltrated through error messages or out-of-band channels.

**Fix:** Call `libxml_disable_entity_loader(true)` on PHP versions below 8.0 (where it is not disabled by default), and pass the `LIBXML_NONET` flag to `simplexml_load_string`. Do not pass `LIBXML_NOENT`, which would trigger entity substitution.

**Explanation:** libxml supports XML External Entities as part of the XML 1.0 specification. By default it will follow `SYSTEM` entity references and read the referenced resource, treating its content as part of the document. `libxml_disable_entity_loader` tells the loader to refuse any entity that requires opening an external resource (file or network). `LIBXML_NONET` adds a second layer by blocking any network fetch that libxml might attempt during parsing (e.g., DTD retrieval over HTTP). On PHP 8.0+ the loader is already disabled, but the version guard means the code stays safe when deployed on older runtimes without relying on the operator to verify the PHP version. A related pitfall: using `simplexml_load_file` with a user-controlled path has its own SSRF risk; always accept only the contents via `file_get_contents` on a validated upload path, as done here.

---

### Issue 2: libxml warnings leak server internals

**Problem:** Without `libxml_use_internal_errors(true)`, parse errors from libxml are emitted as PHP warnings. Depending on the `display_errors` configuration, these warnings can include internal file paths or line references from the XML content, giving an attacker useful reconnaissance data.

**Fix:** Add `libxml_use_internal_errors(true)` and `libxml_clear_errors()` before calling `simplexml_load_string`, and call `libxml_clear_errors()` again inside the `$xml === false` branch before returning the generic error response.

**Explanation:** PHP's libxml integration routes parse diagnostics through its own error buffer. When internal error handling is off, libxml pushes those diagnostics into the PHP warning stream, which `display_errors = On` (common in development environments that get promoted to staging or production) will print directly in the HTTP response. Switching to internal errors captures them in a buffer you control. Calling `libxml_clear_errors()` after you are done prevents the buffer from growing unboundedly across requests in long-lived processes (e.g., PHP-FPM workers), and ensures no stale error from a previous parse leaks into a later request's handling.

---

### Issue 3: PDO silent failure on insert errors

**Problem:** Without an explicit error mode, PDO defaults to `ERRMODE_SILENT`. If an `INSERT` fails (e.g., a constraint violation or a connection drop mid-import), `$stmt->execute()` returns `false` and execution continues silently. The response reports a successful import count even though rows were skipped.

**Fix:** Pass `[PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]` as the fourth argument to the `PDO` constructor so that any statement error throws a `PDOException` immediately.

**Explanation:** `ERRMODE_SILENT` means you must manually call `$stmt->errorInfo()` after every `execute()` call to detect failures. In a loop this is easy to forget, and it was forgotten here. With `ERRMODE_EXCEPTION`, a failed execute throws immediately, stopping the loop and propagating an unhandled exception that the framework or a top-level handler can catch and convert to a 500 response. This prevents the caller from receiving a misleading success count. A related concern: the import is not wrapped in a transaction, so partial failures leave orphaned rows; adding `$pdo->beginTransaction()` / `$pdo->commit()` around the loop would make the import atomic, though that is a separate improvement.
