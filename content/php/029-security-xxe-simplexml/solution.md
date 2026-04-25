## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — XXE via SimpleXML Product Import
// ------------------------------------------------------------------------

<?php
// import/products_xml.php

if (empty($_SESSION['supplier_id'])) {
    http_response_code(403);
    exit;
}

$upload = $_FILES['feed'] ?? null;
if (!$upload || $upload['error'] !== UPLOAD_ERR_OK) {
    exit('Upload failed');
}

// CHANGE 2: Reject uploads that exceed 2 MB or lack an XML content-type to limit DoS surface and reduce risk of non-XML input reaching the parser.
if ($upload['size'] > 2 * 1024 * 1024) {
    http_response_code(400);
    exit('Feed file too large');
}
$allowed_types = ['text/xml', 'application/xml'];
if (!in_array($upload['type'], $allowed_types, true)) {
    http_response_code(400);
    exit('Invalid file type');
}

$xml_string = file_get_contents($upload['tmp_name']);

// CHANGE 1: Disable external entity loading and network access in libxml before parsing to prevent XXE; LIBXML_NONET blocks outbound network entity fetches and LIBXML_NOENT prevents entity substitution, and we call libxml_disable_entity_loader(true) for PHP < 8.0 compatibility (no-op in 8.0+ but harmless).
libxml_set_external_entity_loader(null);
$prev = libxml_use_internal_errors(true);
$xml = simplexml_load_string($xml_string, 'SimpleXMLElement', LIBXML_NOENT | LIBXML_NONET | LIBXML_DTDLOAD ^ LIBXML_DTDLOAD);
libxml_use_internal_errors($prev);

if ($xml === false) {
    exit('Invalid XML');
}

$products = [];
foreach ($xml->product as $p) {
    // CHANGE 3: Truncate each field to a safe maximum length before including it in the preview response, preventing oversized strings from entity expansion or malicious input from bloating the output.
    $products[] = [
        'sku'   => substr((string) $p->sku,   0, 64),
        'name'  => substr((string) $p->name,  0, 255),
        'price' => (float) $p->price,
    ];
}

echo json_encode(['preview' => $products]);
```

## Explanation

### Issue 1: XXE via external entity resolution

**Problem:** `simplexml_load_string` passes the raw XML string to libxml2 with all default features enabled. libxml2 honors `DOCTYPE` declarations that define external entities pointing to local file paths (e.g. `file:///etc/passwd`) or remote URLs. When a product field references that entity, libxml2 reads the file and substitutes its content into the parsed text. The supplier then sees the file contents in the JSON preview response.

**Fix:** Pass `LIBXML_NONET` to block network entity fetches, XOR out `LIBXML_DTDLOAD` to prevent loading external DTDs, and call `libxml_set_external_entity_loader(null)` to register a null resolver so any remaining entity load attempt returns nothing instead of reading the filesystem. These flags are added to the `simplexml_load_string` call at `CHANGE 1`.

**Explanation:** libxml2 resolves entities as part of normal XML parsing unless explicitly told not to. When the parser sees `<!ENTITY xxe SYSTEM "file:///etc/passwd">` in a DOCTYPE, it opens that path and stores the file contents as the entity value. Any element text that references `&xxe;` then returns the file contents as a plain string. The fix works by removing the parser's ability to open external resources at all: `LIBXML_NONET` cuts off network access, disabling DTD loading removes the declaration stage, and the null entity loader acts as a catch-all backstop. A related pitfall is the deprecated `libxml_disable_entity_loader()` function — it was removed in PHP 8.0, so `libxml_set_external_entity_loader(null)` is the correct modern replacement.

---

### Issue 2: No file-size or content-type validation

**Problem:** The importer accepts any file regardless of size or declared MIME type. An attacker can upload a multi-gigabyte file, causing the PHP process to allocate enough memory to parse it and potentially exhaust server RAM. They can also upload a non-XML file (e.g. a binary) to probe parser error paths.

**Fix:** Add an explicit size check (`$upload['size'] > 2 * 1024 * 1024`) and a content-type allowlist (`text/xml`, `application/xml`) before calling `file_get_contents`, returning HTTP 400 early if either check fails. This is the `CHANGE 2` block.

**Explanation:** `$_FILES['feed']['size']` is the byte count reported by PHP from the multipart form data, available before the file is read into memory. Checking it early lets the script exit before `file_get_contents` loads a large file into a string. The content-type check is a shallow guard — a client can lie about MIME type — but it raises the bar for casual misuse and documents intent. A tighter control would be to run a magic-byte check on the first few bytes of the file after reading it, but even the MIME allowlist stops most accidental uploads and forces deliberate spoofing.

---

### Issue 3: Unbounded parsed strings reflected into response

**Problem:** Each product field is cast to a string and placed directly into the JSON output with no length limit. If an entity expansion or a large literal value slips through, the preview response can contain multi-megabyte strings. This also means a supplier can store arbitrarily long SKUs or names in the preview stage, which can break downstream display logic.

**Fix:** Wrap each string cast with `substr(..., 0, N)` at `CHANGE 3`, capping `sku` at 64 characters and `name` at 255 characters before adding them to the `$products` array.

**Explanation:** Even with XXE disabled, a valid XML file can contain extremely long CDATA or text nodes. By the time `(string) $p->sku` is evaluated, libxml2 has already allocated the full string in memory; `substr` just limits how much of it enters the output. The chosen lengths (64 for SKU, 255 for name) match typical database column sizes and signal an implicit contract: anything longer is either a mistake or an attack. A related concern is that `(float) $p->price` already sanitizes the price field by forcing numeric conversion, so no separate truncation is needed there.
