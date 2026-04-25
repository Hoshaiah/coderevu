## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unchecked Offset Enables Data Scraping
// ------------------------------------------------------------------------

<?php
// api/products.php

header('Content-Type: application/json');
require __DIR__ . '/../db.php'; // provides $pdo

// CHANGE 1: Cap per_page to a safe maximum of 100 so bulk-scraping a full catalogue in one request is not possible.
$per_page = min(100, max(1, (int) ($_GET['per_page'] ?? 20)));

// CHANGE 2: Cap page to MAX_PAGE so astronomically large OFFSET values cannot be requested and stall MySQL.
$MAX_PAGE = 1000;
$page     = min($MAX_PAGE, max(1, (int) ($_GET['page'] ?? 1)));

$offset = ($page - 1) * $per_page;

// CHANGE 3: Fetch the total active-product count so we can return pagination metadata and detect out-of-range pages.
$total = (int) $pdo->query("SELECT COUNT(*) FROM products WHERE active = 1")->fetchColumn();
$total_pages = (int) ceil($total / $per_page);

$stmt = $pdo->prepare(
    "SELECT id, name, price, category
       FROM products
      WHERE active = 1
      ORDER BY id
      LIMIT :limit
      OFFSET :offset"
);
$stmt->bindValue(':limit',  $per_page, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset,   PDO::PARAM_INT);
$stmt->execute();

$products = $stmt->fetchAll(PDO::FETCH_ASSOC);

// CHANGE 3: Include total, total_pages, and per_page in the response so clients know the full pagination bounds.
echo json_encode([
    'data'        => $products,
    'page'        => $page,
    'per_page'    => $per_page,
    'total'       => $total,
    'total_pages' => $total_pages,
]);
```

## Explanation

### Issue 1: Unbounded `per_page` Enables Bulk Scraping

**Problem:** A caller sets `per_page=100000` and receives the entire product catalogue in a single HTTP response. The server allocates memory for all those rows, serialises them to JSON, and sends a multi-megabyte payload — degrading the server and handing the requester a complete data dump.

**Fix:** Wrap the existing `max(1, ...)` call in a `min(100, ...)` at the `CHANGE 1` line, so `$per_page` is always in the range `[1, 100]` regardless of what the caller supplies.

**Explanation:** `max(1, ...)` only prevents zero or negative values; it applies no upper bound. Adding `min(100, ...)` on the outside means any value above 100 is silently clamped to 100. The constant 100 should match the largest page size the UI ever legitimately needs; adjust it to fit your product, but keep it well below the point where serialising a single response becomes expensive. A related pitfall: even with this cap, an attacker can still iterate pages — the `page` cap in Issue 2 addresses that axis.

---

### Issue 2: Unbounded `page` Causes Slow-Query DoS

**Problem:** A caller sets `page=999999999`, which computes `OFFSET = (999999999 - 1) * 20 = 19999999960`. MySQL must count through roughly 20 billion index entries before returning a single row, holding a lock and consuming CPU for seconds. Under moderate request volume this saturates the database and times out real shoppers' requests.

**Fix:** Introduce `$MAX_PAGE = 1000` and wrap the `page` calculation in `min($MAX_PAGE, ...)` at the `CHANGE 2` line, capping the page number at 1000.

**Explanation:** MySQL's `OFFSET` implementation is not seek-based; it scans and discards rows from the start of the result set up to the offset point. A large offset is therefore proportional in cost to the offset value itself, not to `LIMIT`. Capping `page` at 1000 limits the worst-case `OFFSET` to `999 * 100 = 99900` rows — expensive but survivable. For catalogues where deep pagination is genuinely required, a keyset/cursor pagination scheme (`WHERE id > :last_seen_id`) eliminates the problem entirely, but a hard cap is the minimal, safe fix here.

---

### Issue 3: Missing Pagination Metadata Hides Bounds From Clients

**Problem:** The response only contains `data` and `page`. A legitimate client has no way to know how many pages exist, so it may keep requesting incrementing page numbers past the end of the catalogue — generating unnecessary queries — and has no way to render a page-count UI element.

**Fix:** Add a `SELECT COUNT(*)` query at `CHANGE 3` and include `total`, `total_pages`, and `per_page` fields in the `json_encode` call at `CHANGE 3`.

**Explanation:** Without `total_pages`, a client only learns pagination is exhausted when it receives an empty `data` array, which requires at least one extra round-trip per session. Returning `total_pages` lets the client stop early and display accurate UI controls. The `COUNT(*)` query on a filtered index (`active = 1`) is cheap compared to the data fetch; MySQL can satisfy it with an index-only scan. One pitfall: if the catalogue changes between the count query and the data query, `total_pages` may be stale by one — that is acceptable for a product listing; use a transaction with `REPEATABLE READ` only if exact consistency is critical.
