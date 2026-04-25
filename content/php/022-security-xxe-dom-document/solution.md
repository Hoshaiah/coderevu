## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — DOMDocument Loads External Entities
// ------------------------------------------------------------------------

<?php
// integrations/invoice_importer.php

header('Content-Type: application/json');

$xml_body = file_get_contents('php://input');
if (empty($xml_body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty body']);
    exit;
}

// CHANGE 1: Disable external entity loading before parsing to prevent XXE attacks; libxml_disable_entity_loader is the correct toggle in PHP < 8.0, and LIBXML_NONET|LIBXML_NOENT flags are used in loadXML for broader coverage.
libxml_disable_entity_loader(true);

$doc = new DOMDocument();

// CHANGE 2: Use LIBXML_NONET and LIBXML_NOENT flags to prevent network requests and entity substitution, and use libxml_use_internal_errors to capture parse errors and return a 400 on failure instead of silently continuing.
libxml_use_internal_errors(true);
$result = $doc->loadXML($xml_body, LIBXML_NONET | LIBXML_NOENT | LIBXML_DTDLOAD ^ LIBXML_DTDLOAD);
if ($result === false) {
    $errors = libxml_get_errors();
    libxml_clear_errors();
    http_response_code(400);
    echo json_encode(['error' => 'Invalid XML', 'detail' => isset($errors[0]) ? trim($errors[0]->message) : 'parse error']);
    exit;
}
libxml_clear_errors();

$invoice_id  = $doc->getElementsByTagName('invoice_id')->item(0)?->textContent ?? '';
$amount      = $doc->getElementsByTagName('amount')->item(0)?->textContent ?? '';
$vendor      = $doc->getElementsByTagName('vendor')->item(0)?->textContent ?? '';

// CHANGE 3: Validate extracted fields to ensure they match expected formats before including them in the response, preventing unexpected or oversized values from passing through.
$invoice_id = preg_match('/^[\w\-]{1,64}$/', $invoice_id) ? $invoice_id : '';
$amount     = is_numeric($amount) ? $amount : '';
$vendor     = mb_substr(strip_tags($vendor), 0, 255);

if ($invoice_id === '' || $amount === '') {
    http_response_code(422);
    echo json_encode(['error' => 'Missing or invalid required fields']);
    exit;
}

echo json_encode([
    'status'     => 'imported',
    'invoice_id' => $invoice_id,
    'amount'     => $amount,
    'vendor'     => $vendor,
]);
```

## Explanation

### Issue 1: XXE via external entity loading

**Problem:** PHP's `DOMDocument::loadXML()` resolves external entities declared in a DOCTYPE by default. An attacker submits XML like `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><invoice><vendor>&xxe;</vendor></invoice>` and the contents of `/etc/passwd` appear in the `vendor` field of the JSON response. IP allowlisting and HTTP Basic Auth only limit who can reach the endpoint — they do not prevent a compromised partner or a credential leak from exploiting this.

**Fix:** Call `libxml_disable_entity_loader(true)` before constructing the `DOMDocument`, and pass `LIBXML_NONET` to `loadXML()` so that even if entity loading is attempted, no network or filesystem lookups occur.

**Explanation:** When libxml parses a DOCTYPE, it follows `SYSTEM` or `PUBLIC` entity references by opening the named URI — including `file://` paths — and substituting the file contents inline as text. `libxml_disable_entity_loader(true)` tells libxml to refuse to open any such external resource. `LIBXML_NONET` adds a second layer that blocks network-based URIs (e.g., `http://attacker.com/evil.dtd`). Together they ensure that even a maliciously crafted DTD cannot cause the parser to touch the filesystem or network. Note: in PHP 8.0+ `libxml_disable_entity_loader` is deprecated because external entity loading is disabled by default, but calling it is harmless and keeps the code safe when deployed on PHP 7.x servers.

---

### Issue 2: Silent parse failure on invalid XML

**Problem:** If `loadXML()` fails — for any reason, including a malformed payload — it returns `false` but the code continues running. `getElementsByTagName()` calls on an unpopulated `DOMDocument` return empty `DOMNodeList` objects, so all three fields silently become empty strings and a `200 imported` response is sent. This makes errors invisible and could mask injection attempts.

**Fix:** Enable `libxml_use_internal_errors(true)`, check the return value of `loadXML()`, and return a `400` with the captured libxml error message when parsing fails, followed by `libxml_clear_errors()` to avoid memory leaks.

**Explanation:** By default libxml emits parse errors as PHP warnings, which may be suppressed by the error-reporting configuration and are never surfaced in the JSON response. `libxml_use_internal_errors(true)` redirects those errors to an internal queue so you can inspect them with `libxml_get_errors()`. Checking `$result === false` is necessary because `loadXML()` does not throw an exception — it only signals failure through its return value. Clearing errors after each request is important; errors accumulate in a global buffer across requests in long-running processes (e.g., PHP-FPM workers), so stale errors from earlier requests can bleed into later error reports.

---

### Issue 3: Unvalidated text content passed to response

**Problem:** `textContent` from any XML node is taken verbatim and inserted into the JSON response. An attacker can send an `invoice_id` with path-traversal characters, a `vendor` field containing thousands of characters or embedded HTML, or an `amount` that is not a number at all. Downstream systems that consume this JSON and trust the `imported` status may then process garbage or malicious data.

**Fix:** Apply format checks to each extracted value: `preg_match('/^[\w\-]{1,64}$/', $invoice_id)` to enforce an alphanumeric ID, `is_numeric($amount)` to reject non-numeric amounts, and `mb_substr(strip_tags($vendor), 0, 255)` to strip tags and cap length on the free-text field. Return a `422` if required fields fail validation.

**Explanation:** `DOMDocument` gives you the raw text node value with no filtering; it does not enforce any schema. A `<amount>; DROP TABLE invoices--</amount>` node becomes the string `"; DROP TABLE invoices--"` which then flows into whatever downstream SQL or API call processes the imported data. Validating the type and shape of each field at the boundary — before the data is considered "imported" — prevents malformed values from propagating. Using `is_numeric()` for `amount` is intentionally permissive (it accepts decimals and scientific notation) but still blocks non-numeric garbage; tighten it to a regex like `/^\d+(\.\d{1,2})?$/` if the domain only allows positive decimal amounts.
