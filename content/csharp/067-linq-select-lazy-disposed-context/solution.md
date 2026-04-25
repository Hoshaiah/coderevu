## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — IQueryable Enumerated After Context Disposed
// ------------------------------------------------------------------------

// OrderRepository.cs
public IQueryable<OrderSummary> GetRecentSummaries(DateTime since)
{
    return _context.Orders
        .Where(o => o.CreatedAt >= since)
        .Select(o => new OrderSummary
        {
            Id = o.Id,
            CustomerName = o.Customer.Name,
            Total = o.LineItems.Sum(l => l.Quantity * l.UnitPrice)
        });
}

// ReportingService.cs
public async Task<List<OrderSummary>> GetTopOrdersAsync(DateTime since, int count)
{
    using var scope = _serviceScopeFactory.CreateScope();
    var repo = scope.ServiceProvider.GetRequiredService<OrderRepository>();

    var query = repo.GetRecentSummaries(since);

    // CHANGE 1: Materialize the query inside the using block so the DbContext is still alive when EF executes the SQL.
    // CHANGE 2: Chain the ordering and Take here, before calling ToList, so a single query is sent to the database.
    return query
        .OrderByDescending(s => s.Total)
        .Take(count)
        .ToList();
}
// NOTE: The closing brace of the using-var scope must encompass the ToList call.
// The fix is to move the return statement (with full materialization) inside the scope lifetime.
// Restructured to make the scope disposal happen AFTER ToList:
public async Task<List<OrderSummary>> GetTopOrdersAsync_Fixed(DateTime since, int count)
{
    using var scope = _serviceScopeFactory.CreateScope();
    var repo = scope.ServiceProvider.GetRequiredService<OrderRepository>();

    var query = repo.GetRecentSummaries(since);

    // CHANGE 1: Call ToList (materialize) before the scope — and its DbContext — is disposed at the end of the using block.
    // CHANGE 2: The full ordering and Take are composed here and executed as a single SQL query before the using block closes.
    var result = query
        .OrderByDescending(s => s.Total)
        .Take(count)
        .ToList();

    return result;
}
```

## Explanation

### Issue 1: Query Executed After DbContext Disposed

**Problem:** `GetRecentSummaries` returns an `IQueryable<OrderSummary>`. No SQL runs when that method returns. In the original code, the `using var scope` block ends implicitly at the closing brace of `GetTopOrdersAsync`, but the `return` statement that calls `.ToList()` is the *last* statement — meaning C# disposes `scope` (and its `DbContext`) before `.ToList()` actually executes the SQL. The app throws `ObjectDisposedException` at runtime.

**Fix:** Assign the materialized result to a local variable (`var result = query...ToList()`) *before* the end of the `using var scope` block, then return that variable. This is shown at the `CHANGE 1` site in `GetTopOrdersAsync_Fixed`.

**Explanation:** `using var` in C# disposes the object at the end of the enclosing scope (the method's closing brace). The `return` expression is evaluated just before the method exits, but disposal of `using var` declarations happens as part of that same exit sequence — and the compiler disposes locals in reverse declaration order before the return value is handed back. So `scope.Dispose()` runs, which disposes the `DbContext`, and *then* EF tries to open a database connection to run the `IQueryable` — hence the `ObjectDisposedException`. Materializing into a `List<T>` before the method exits forces EF to run the SQL while the context is still alive. A related pitfall: returning `IEnumerable<T>` from a method that wraps a `using` block has the same problem because `IEnumerable` is also lazily iterated.

---

### Issue 2: IQueryable Leaked Across Scope Boundary

**Problem:** `GetRecentSummaries` exposes `IQueryable<OrderSummary>` as its return type. Any caller that stores that reference and defers iteration — even briefly — risks executing the query after the scope that owns the `DbContext` is gone. The bug is latent in the repository's public API: it hands out a live query object tied to a scoped resource.

**Fix:** Inside `GetTopOrdersAsync_Fixed`, all LINQ composition (`.OrderByDescending`, `.Take`) and materialization (`.ToList()`) happen within the `using var scope` block before the result is returned, as shown at the `CHANGE 2` site. The repository method itself could also be changed to return `IEnumerable<OrderSummary>` or `List<OrderSummary>` to prevent callers from deferring execution, but the immediate fix is on the calling side.

**Explanation:** `IQueryable<T>` holds a reference to the `DbContext` that will open a connection and run SQL the moment something iterates it. When a method returns `IQueryable<T>`, the caller controls when that happens. If the caller is in a different lifetime scope — or wraps the call in its own `using` block as `ReportingService` does — there is no compile-time guarantee that the context survives long enough. `.AsNoTracking()` does not help because it only changes change-tracking behavior; it does not eager-load data or detach the query from the context. The safe rule is: never let an `IQueryable` outlive the `DbContext` that created it. Returning `List<T>` or `IReadOnlyList<T>` from repository methods makes this contract explicit.
