## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — COUNT Query Ignores Active Filter
// ------------------------------------------------------------------------

<?php
// src/Repository/ProductRepository.php

class ProductRepository
{
    public function __construct(private PDO $pdo) {}

    public function listPaginated(
        int  $page,
        int  $perPage,
        bool $activeOnly = false
    ): array {
        $offset = ($page - 1) * $perPage;

        // CHANGE 2: Build $whereParams separately so the COUNT and SELECT queries each get their own clean binding array; the old code stuffed the active=1 literal into $params before LIMIT/OFFSET, corrupting positional bindings.
        $whereParams = [];
        $where = '';
        if ($activeOnly) {
            $where         = 'WHERE active = 1';
            $whereParams[] = 1;
        }

        // CHANGE 1: Use a prepared statement that includes the same $where clause so the count reflects only the filtered rows, not the entire table.
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM products $where");
        $countStmt->execute($whereParams);
        $total = (int) $countStmt->fetchColumn();

        $params   = $whereParams;
        $params[] = $perPage;
        $params[] = $offset;

        $sql  = "SELECT id, sku, name, price FROM products $where LIMIT ? OFFSET ?";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'data'  => $rows,
            'total' => $total,
            'page'  => $page,
        ];
    }
}
```

## Explanation

### Issue 1: COUNT query ignores active filter

**Problem:** When warehouse staff enable the "active only" filter, the pagination header still reports 12,000 total products instead of 3,000. This is because `$total` is derived from a hard-coded `SELECT COUNT(*) FROM products` that has no `WHERE` clause, so it always counts every row regardless of `$activeOnly`.

**Fix:** Replace `$this->pdo->query('SELECT COUNT(*) FROM products')` with a prepared statement `$this->pdo->prepare("SELECT COUNT(*) FROM products $where")` executed with `$whereParams`, exactly mirroring the filter applied to the data query.

**Explanation:** The data SELECT correctly appends `WHERE active = 1` when `$activeOnly` is true, but the COUNT SELECT is constructed independently as a plain string with no filter. Because the two queries are decoupled, the total and the actual result set diverge whenever a filter is active. The fix constructs both queries from the same `$where` variable, so they always stay in sync. A related pitfall: if you later add more filter conditions (e.g., a category filter), you only need to update `$where` and `$whereParams` in one place and both queries inherit the change automatically.

---

### Issue 2: Shared `$params` array corrupts positional bindings

**Problem:** The original code pushes the literal `1` (the bound value for `active = 1`) into `$params` before the COUNT query runs, then appends `$perPage` and `$offset` afterward. Because the COUNT query uses `pdo->query()` and ignores `$params` entirely, that stray `1` sits at index 0 when the main SELECT is executed, shifting `$perPage` to position 1 and `$offset` to position 2 — which is actually correct by accident when `$activeOnly` is true, but the intent is unclear and the code breaks if the COUNT is ever converted to a prepared statement that consumes the first element.

**Fix:** Introduce a separate `$whereParams` array that holds only the filter bindings. The main `$params` array is then assembled fresh by copying `$whereParams` and appending `$perPage` and `$offset`, keeping concerns separated and making the binding order explicit.

**Explanation:** PDO positional (`?`) binding matches array elements to placeholders in order. When one array is shared across queries with different placeholder counts, any mismatch silently binds the wrong value or throws a binding-count error. Keeping `$whereParams` and the final `$params` array distinct makes the data flow traceable: `$whereParams` feeds the COUNT, and `$params` (which is `$whereParams` plus the two pagination values) feeds the SELECT. This also makes it straightforward to add future filters — append to `$whereParams` once, and both queries receive the correct bound values.
