## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Disposing an Injected Dependency
// ------------------------------------------------------------------------

public class ProductRepository : IProductRepository
{
    private readonly ApplicationDbContext _db;

    public ProductRepository(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<Product?> GetByIdAsync(int id)
    {
        return await _db.Products.FindAsync(id);
    }

    public async Task<List<Product>> GetAllAsync()
    {
        return await _db.Products.ToListAsync();
    }

    public async Task AddAsync(Product product)
    {
        _db.Products.Add(product);
        await _db.SaveChangesAsync();
    }

    // CHANGE 1: Removed the Dispose() method entirely — the repository does not own the DbContext so it must not dispose it; the DI container disposes the scoped DbContext at end-of-scope.
    // CHANGE 2: Removed IDisposable from the class declaration — implementing IDisposable caused the DI container to call Dispose() on this repository, which in turn disposed the shared DbContext too early.
}
```

## Explanation

### Issue 1: Repository disposing injected DbContext it does not own

**Problem:** After a few requests, any database call throws `ObjectDisposedException: Cannot access a disposed context instance`. The repository is freshly constructed each request (confirmed by logging), yet the context it receives is already disposed by the time the query runs.

**Fix:** Remove the `Dispose()` method body that calls `_db.Dispose()`. The `ApplicationDbContext` is never touched in the repository's cleanup path in the reference solution.

**Explanation:** When the DI container constructs a scoped `ProductRepository`, it hands the repository the same `ApplicationDbContext` instance that belongs to the current DI scope. That context's lifetime is managed by the scope — the container will dispose it when the scope ends (i.e., at the end of the HTTP request). When `ProductRepository.Dispose()` also calls `_db.Dispose()`, it disposes the context a second time, or disposes it before the scope has finished using it for other services registered in the same scope. A rule of thumb: if you did not `new` it, you do not `Dispose` it. The fix is to simply not call `Dispose` on dependencies you received via injection.

---

### Issue 2: Unnecessary IDisposable implementation triggering early disposal

**Problem:** Even if the `Dispose()` method were empty, advertising `IDisposable` on the repository changes how the DI container treats it. The container sees `IDisposable` and schedules a `Dispose()` call on the repository at scope end — which, combined with Issue 1, is what executes `_db.Dispose()` prematurely.

**Fix:** Remove `IDisposable` from the class declaration (`public class ProductRepository : IProductRepository` instead of `public class ProductRepository : IProductRepository, IDisposable`).

**Explanation:** ASP.NET Core's built-in DI container tracks every scoped or transient service that implements `IDisposable` and calls `Dispose()` on it when the scope is torn down. If `ProductRepository` implements `IDisposable`, the container adds it to that tracked list. When the scope ends, it calls `repo.Dispose()`, which (via Issue 1) calls `_db.Dispose()`. Removing `IDisposable` from the repository stops the container from scheduling that call. The `ApplicationDbContext` itself implements `IDisposable`, so the container still disposes it correctly through its own tracked registration — no manual help is needed. A repository only needs `IDisposable` if it directly opens something unmanaged (a file handle, a raw `SqlConnection`, etc.) that nothing else owns.
