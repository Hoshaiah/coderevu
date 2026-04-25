## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Take Without OrderBy Nondeterministic
// ------------------------------------------------------------------------

public class ProductRepository
{
    private readonly AppDbContext _db;

    public ProductRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<Product>> GetFeaturedProductsAsync()
    {
        return await _db.Products
            .Where(p => p.IsActive && p.IsFeatured)
            // CHANGE 1: Added OrderByDescending(p => p.DisplayOrder) so that Take(5) always picks the five products with the highest DisplayOrder; without this, SQL Server returns rows in whatever order the query plan chooses, which varies between executions and under load.
            .OrderByDescending(p => p.DisplayOrder)
            .Take(5)
            .ToListAsync();
    }
}
```

## Explanation

### Issue 1: Missing ORDER BY Makes Take Non-Deterministic

**Problem:** The homepage banner shows different products on each page refresh, and two simultaneous requests can return completely different sets of five products. Product managers see unexpected items appearing and disappearing from the promotional banner without any data changes.

**Fix:** Insert `.OrderByDescending(p => p.DisplayOrder)` immediately after the `.Where(...)` clause and before `.Take(5)`. This is the only line added in CHANGE 1.

**Explanation:** SQL Server (and every ANSI-compliant relational database) makes no guarantee about the order in which rows are returned unless the query contains an explicit `ORDER BY`. Without one, the engine is free to return rows in index scan order, heap scan order, or whatever its query plan finds cheapest — and that plan can change between executions depending on statistics, parallelism, and buffer cache state. LINQ's `.Take(5)` translates directly to `TOP (5)` in T-SQL, and `TOP` without `ORDER BY` inherits this same non-determinism. With only a handful of rows in development the table fit in a single page and the scan order happened to be stable, masking the bug. Under production load with many rows, parallel scans and interleaved I/O produce visibly different orderings per request. Adding `.OrderByDescending(p => p.DisplayOrder)` emits `ORDER BY DisplayOrder DESC` in the generated SQL, which forces the engine to sort before truncating, so `TOP (5)` always returns the five rows with the largest `DisplayOrder` values.

---

### Issue 2: Stale Banner Products Due to No Deterministic Tie-Breaking

**Problem:** When multiple products share the same `DisplayOrder` value, the five selected products can still vary between requests even after adding a sort, because ties are broken arbitrarily by the engine. Operators see the banner rotating between eligible products with equal priority.

**Fix:** A secondary sort column such as `.ThenBy(p => p.Id)` can be appended after `.OrderByDescending(p => p.DisplayOrder)` to provide a stable, deterministic tie-breaker. The primary CHANGE 1 fix handles the most common case; this is a follow-on hardening step.

**Explanation:** An `ORDER BY` on a non-unique column like `DisplayOrder` is deterministic only when all values in the sorted column are distinct. If two products share the same `DisplayOrder`, SQL Server can return either one first — it is technically compliant with the `ORDER BY` clause either way. In practice this means the five selected products can still rotate between requests when there are six or more featured products tied at the top `DisplayOrder` value. Appending `.ThenBy(p => p.Id)` (or any unique column) makes the full sort key unique, so the engine produces the same ranking every time. This is especially important if product managers regularly assign bulk `DisplayOrder` values during promotional campaigns.
