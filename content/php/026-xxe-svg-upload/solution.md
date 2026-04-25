## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — XXE via SVG Upload
// ------------------------------------------------------------------------

<?php
// api/avatars/upload.php

session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401); exit;
}

$file    = $_FILES['avatar'];
$tmpPath = $file['tmp_name'];
$mime    = mime_content_type($tmpPath);

if (!in_array($mime, ['image/png', 'image/jpeg', 'image/svg+xml'], true)) {
    http_response_code(415);
    echo json_encode(['error' => 'Unsupported type']);
    exit;
}

if ($mime === 'image/svg+xml') {
    $raw = file_get_contents($tmpPath);

    // CHANGE 1: Disable libxml's external entity loader before any XML parsing so DOCTYPE/ENTITY declarations cannot cause file reads or SSRF.
    $previousEntityLoader = libxml_disable_entity_loader(true);

    $dom = new DOMDocument();
    // CHANGE 2: Pass LIBXML_NONET | LIBXML_NOENT to loadXML — LIBXML_NONET blocks network fetch attempts and LIBXML_NOENT prevents entity substitution at the parser level.
    $dom->loadXML($raw, LIBXML_NONET | LIBXML_NOENT);

    // CHANGE 1 (restore): Restore the previous entity-loader state after parsing is complete so we don't affect other code in the same process.
    libxml_disable_entity_loader($previousEntityLoader);

    // CHANGE 3: Collect all script nodes into a plain array first so that removing them does not corrupt the live NodeList iterator and skip siblings.
    $scriptNodes = iterator_to_array($dom->getElementsByTagName('script'));
    foreach ($scriptNodes as $node) {
        $node->parentNode->removeChild($node);
    }

    $sanitised = $dom->saveXML();
    // ... upload $sanitised to S3 ...
} else {
    // ... upload raw file to S3 ...
}

echo json_encode(['status' => 'ok']);
```

## Explanation

### Issue 1: External entity loading not disabled

**Problem:** An attacker uploads an SVG containing a DOCTYPE declaration that defines an external entity pointing to `/etc/passwd` or `file:///app/.env`. When `DOMDocument::loadXML()` parses the file, libxml resolves the entity and substitutes its contents into the document. `saveXML()` then serialises the file contents into the stored SVG, which the attacker retrieves by loading their avatar URL.

**Fix:** Call `libxml_disable_entity_loader(true)` before `loadXML()` and restore the previous state afterward (CHANGE 1). This tells libxml's global loader to refuse all external entity resolution regardless of what the XML document declares.

**Explanation:** PHP's libxml binds a single process-wide entity loader. Unless that loader is disabled, any `DOMDocument`, `SimpleXML`, or `XMLReader` parse in the process will honour `<!ENTITY xxe SYSTEM "file:///etc/passwd">` declarations. The flag must be set before the parse call because libxml resolves entities during tokenisation, not after. Restoring the previous value with the returned boolean is important in long-running processes (e.g. FPM workers handling multiple requests) where other legitimate XML parsing might rely on the default behaviour.

---

### Issue 2: Parser-level entity substitution not suppressed

**Problem:** Even with the entity loader disabled, passing no flags to `loadXML()` leaves entity substitution active at the parser level. Depending on the libxml version and build flags, certain internal or pre-defined entities can still be expanded, and the code provides no defence-in-depth against future libxml behaviour changes.

**Fix:** Pass `LIBXML_NONET | LIBXML_NOENT` as the second argument to `loadXML()` (CHANGE 2). `LIBXML_NONET` prevents the parser from opening any network connection during parsing, and `LIBXML_NOENT` substitutes entities with their literal text rather than resolving them from external sources, closing the substitution path.

**Explanation:** `LIBXML_NONET` is a belt-and-suspenders control: even if the entity loader is somehow re-enabled elsewhere in the codebase, the parser itself will refuse TCP connections triggered by `SYSTEM` entity URIs like `http://internal-host/`. `LIBXML_NOENT` changes entity handling so that `&foo;` is treated as its declared literal value rather than being fetched. Together these flags make the parse safe independent of the global loader state, which matters because `libxml_disable_entity_loader` is global mutable state that can be toggled by any other library loaded into the same PHP process.

---

### Issue 3: Live NodeList iteration skips nodes during removal

**Problem:** `getElementsByTagName('script')` returns a live `DOMNodeList`. When the loop removes the first `<script>` node, the list immediately shrinks and re-indexes. The next iteration reads index 1, which is now what was previously index 2, so every other `<script>` tag is silently left in the document.

**Fix:** Wrap the live list with `iterator_to_array()` before the loop (CHANGE 3). This snapshots all matching nodes into a plain PHP array, so removals during iteration do not affect the collection being iterated.

**Explanation:** A live `DOMNodeList` reflects the current state of the DOM at every array access. After you call `removeChild()` on item 0, item 1 becomes item 0. The `foreach` counter advances to 1, which is now the third original node, and the second original `<script>` is never visited. `iterator_to_array()` calls `current()`/`next()` once up front to build a static array of node references. The nodes themselves are still live DOM objects, so `removeChild()` works correctly on each one; only the list used for iteration is frozen.
