## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — XMLReader Parses Untrusted External Entities
// ------------------------------------------------------------------------

<?php
// api/ImportOrders.php

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['error' => 'Method not allowed']));
}

$xmlContent = file_get_contents('php://input');

$reader = new XMLReader();

// CHANGE 1: Disable external entity loading on the underlying libxml parser before opening any input, preventing XXE attacks where DOCTYPE/ENTITY declarations resolve to local files or remote URLs.
libxml_set_external_entity_loader(function () { return null; });

// CHANGE 1: Pass LIBXML_NONET | LIBXML_DTDLOAD=0 equivalent by using the options bitmask to forbid network access and suppress DTD loading, closing both file-read and SSRF vectors.
$reader->XML($xmlContent, null, LIBXML_NONET | LIBXML_NOENT);

$orders = [];
while ($reader->read()) {
    if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'order') {
        $node = $reader->expand();

        // CHANGE 2: Guard against missing child elements before calling textContent to avoid fatal null-dereference errors on malformed order documents.
        $refNode    = $node->getElementsByTagName('ref')->item(0);
        $amountNode = $node->getElementsByTagName('amount')->item(0);

        if ($refNode === null || $amountNode === null) {
            continue;
        }

        $orders[] = [
            'ref'    => $refNode->textContent,
            'amount' => $amountNode->textContent,
        ];
    }
}
$reader->close();

echo json_encode(['imported' => count($orders)]);
```

## Explanation

### Issue 1: XXE external entity injection

**Problem:** When a partner POSTs an XML file containing a `DOCTYPE` declaration with an `ENTITY` that references a local file path (e.g., `<!ENTITY xxe SYSTEM "file:///etc/passwd">`), `XMLReader` resolves and inlines the file content when it expands the node. The `textContent` of `ref` or `amount` then contains the raw file data, which gets returned in the JSON response.

**Fix:** Two lines are added before `$reader->XML(...)`. `libxml_set_external_entity_loader(function () { return null; })` replaces the default resolver with one that always returns nothing. The `LIBXML_NONET` flag passed to `$reader->XML(...)` additionally blocks any network-based entity resolution.

**Explanation:** `XMLReader` is built on libxml2, which by default follows `SYSTEM` and `PUBLIC` entity references to file paths or URLs and substitutes their content inline. A DOCTYPE like `<!ENTITY secret SYSTEM "file:///etc/passwd">` with `&secret;` inside an order field causes libxml2 to open the file and splice its bytes into the parse tree. `libxml_set_external_entity_loader` installs a PHP-level callback that libxml2 calls whenever it needs to resolve any external resource; returning `null` makes libxml2 treat every external reference as empty. `LIBXML_NONET` adds a belt-and-suspenders block at the C layer for HTTP/FTP URIs. Note that `LIBXML_NOENT` in the original options list actually expands entities rather than disabling them — it should not be used here; the callback is the correct primary defence.

---

### Issue 2: Null dereference on missing child elements

**Problem:** `getElementsByTagName('ref')->item(0)` returns `null` when an `<order>` element has no `<ref>` child. Calling `->textContent` on `null` throws a fatal error in PHP 8 (`Call to a member function textContent on null`), crashing the endpoint for the entire upload even if only one order is malformed.

**Fix:** The results of both `getElementsByTagName('ref')->item(0)` and `getElementsByTagName('amount')->item(0)` are stored in `$refNode` and `$amountNode`. A null check (`if ($refNode === null || $amountNode === null) { continue; }`) skips the malformed order instead of crashing.

**Explanation:** `DOMNodeList::item(int $index)` returns `null` when no node exists at that index — it does not throw. The code then dereferences the return value assuming it is always a `DOMNode`, which works only when every `<order>` is well-formed. Storing the result first and checking for null before accessing properties is the standard defensive pattern for DOM traversal. A related pitfall: `textContent` on a node that exists but is empty returns an empty string, which is valid; the null case is the only one that causes a fatal error.
