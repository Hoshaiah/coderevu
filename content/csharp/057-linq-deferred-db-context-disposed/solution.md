## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Deferred LINQ Query After DbContext Disposal
// ------------------------------------------------------------------------

// ProductRepository.cs
public class ProductRepository
{
    private readonly IDbContextFactory<ShopDbContext> _factory;

    public ProductRepository(IDbContextFactory<ShopDbContext> factory)
    {
        _factory = factory;
    }

    // CHANGE 1: Call ToList() before exiting the using block so EF executes the SELECT while the DbContext is still alive; the disposed context can no longer be reached after this method returns.
    // CHANGE 2: Return IReadOnlyList<Product> instead of IEnumerable<Product> to make it clear to callers that the data is already in memory and further deferred queries against the DB are not possible.
    public IReadOnlyList<Product> GetActiveProducts()
    {
        using var db = _factory.CreateDbContext();
        return db.Products.Where(p => p.IsActive).ToList();
    }
}

// ReportService.cs
public class ReportService
{
    private readonly ProductRepository _repo;

    public ReportService(ProductRepository repo)
    {
        _repo = repo;
    }

    public async Task<Report> GenerateReportAsync()
    {
        var products = _repo.GetActiveProducts();

        var summary = products
            .GroupBy(p => p.Category)
            .Select(g => new CategorySummary
            {
                Category = g.Key,
                Count = g.Count(),
                TotalRevenue = g.Sum(p => p.Revenue)
            })
            .ToList();

        return new Report { Categories = summary };
    }
}
```

## Explanation

### Issue 1: Deferred Query Outlives DbContext

**Problem:** `GetActiveProducts()` returns `db.Products.Where(p => p.IsActive)` — an `IQueryable<Product>` cast to `IEnumerable<Product>` — without ever executing the SQL. The `using var db` block disposes the `DbContext` the moment the method returns. When the caller's `.GroupBy().Select().ToList()` in `GenerateReportAsync` finally tries to pull rows, EF attempts to use the already-disposed context and throws `ObjectDisposedException`.

**Fix:** Add `.ToList()` inside the `using` block in `GetActiveProducts`, on the line `return db.Products.Where(p => p.IsActive).ToList();`. This forces EF to run the SELECT and copy all rows into a plain `List<Product>` while `db` is still open.

**Explanation:** EF's `Where()` on a `DbSet` produces an `IQueryable` that stores a query expression tree, not data. Enumeration (the actual SQL round-trip) is deferred until something iterates the sequence — in this case the `GroupBy` chain in the service layer. By then the `using` block has already called `Dispose()` on the context, so EF has no live connection to work with. Calling `ToList()` before the `using` block exits forces immediate enumeration, materialises the rows into a managed list, and severs any dependency on the context. The reason this only appears in production is that with a large dataset EF uses a streaming cursor that must stay open; with a tiny dev dataset the query may be buffered internally before disposal, masking the bug.

---

### Issue 2: Return Type Hides Materialization Contract

**Problem:** Even after adding `ToList()`, keeping the return type as `IEnumerable<Product>` lets any future developer — or a refactor — accidentally remove the `ToList()` call and silently reintroduce the same bug. The interface makes both a materialised list and a live deferred query look identical to callers.

**Fix:** Change the return type of `GetActiveProducts()` from `IEnumerable<Product>` to `IReadOnlyList<Product>`. The implementation already returns a `List<Product>`, so no cast is needed; only the declared return type changes.

**Explanation:** `IReadOnlyList<T>` communicates to every caller that the data is already fully in memory: it has a `Count`, supports index access, and carries no connection to any underlying store. A reader of the call site sees `IReadOnlyList<Product>` and understands there is nothing left to materialise. If someone later tries to return an un-executed `IQueryable` here, the compiler rejects it because `IQueryable` does not implement `IReadOnlyList`. This makes the boundary between the persistence layer and the service layer explicit in the type system rather than relying on a convention that is easy to miss in code review.
