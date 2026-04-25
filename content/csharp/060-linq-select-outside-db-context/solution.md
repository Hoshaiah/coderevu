## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — LINQ Projection Evaluated After Dispose
// ------------------------------------------------------------------------

public class ReportService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public ReportService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    // CHANGE 2: Return a concrete List<OrderSummary> instead of IEnumerable<OrderSummary> so the caller cannot accidentally defer evaluation past the using scope.
    public List<OrderSummary> GetOrderSummaries(DateTime date)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // CHANGE 1: Call .ToList() inside the using block to materialize the query immediately while the DbContext is still alive, preventing ObjectDisposedException at iteration time.
        // CHANGE 3: Add .Include(o => o.Customer) so EF Core eagerly loads the related Customer row in the same SQL query rather than attempting a lazy load after the context is disposed.
        return db.Orders
            .Include(o => o.Customer)
            .Where(o => o.CreatedAt.Date == date.Date)
            .Select(o => new OrderSummary
            {
                Id = o.Id,
                Total = o.Total,
                CustomerName = o.Customer.Name
            })
            .ToList();
    }
}
```

## Explanation

### Issue 1: Deferred Query Executed After Dispose

**Problem:** The job crashes every night with `ObjectDisposedException` deep inside LINQ's iterator machinery. The stack trace points at an `OrderSummary` property getter because that is where EF Core actually sends the SQL query to the database — not at the `.Select()` call site.

**Fix:** Add `.ToList()` at the end of the query chain, inside the `using var scope` block (CHANGE 1). This forces EF Core to execute the SQL immediately and copy all results into a plain `List<OrderSummary>` before the scope — and therefore the `DbContext` — is disposed.

**Explanation:** LINQ queries against an EF Core `DbSet` are lazy by design. Calling `.Where()` and `.Select()` builds an expression tree but sends no SQL. SQL is sent only when the sequence is iterated — for example, when the caller does `foreach` or passes the result to another LINQ operator. By the time the caller iterates, `using var scope` has already run its `Dispose()`, tearing down the `DbContext`. EF Core then tries to open a connection on a disposed object and throws. Calling `.ToList()` inside the `using` block forces iteration right there, while the context is still open, turning the lazy sequence into an in-memory list that is safe to hand off to any caller.

---

### Issue 2: Return Type Allows Deferred Iteration

**Problem:** Returning `IEnumerable<OrderSummary>` from a method that internally uses a scoped `DbContext` is a contract mismatch. Any caller can store the return value and iterate it later — after the scope is gone — and the code gives no warning that doing so will crash.

**Fix:** Change the return type from `IEnumerable<OrderSummary>` to `List<OrderSummary>` (CHANGE 2). Because `List<T>` is already materialized, callers cannot accidentally re-trigger deferred execution.

**Explanation:** `IEnumerable<T>` carries no promise about whether the data has been fetched. A caller seeing `IEnumerable<OrderSummary>` may reasonably LINQ-chain onto it, pass it to a serializer, or store it in a field — all of which defer or repeat enumeration. Returning `List<T>` makes the fulfilled, in-memory nature of the result explicit in the type system. It also prevents a subtle repeat-execution bug: if a caller iterates an `IEnumerable` twice (e.g., `.Count()` then `foreach`), EF Core would try to run the SQL twice, hitting the disposed context on the second pass.

---

### Issue 3: Navigation Property Accessed Without Eager Loading

**Problem:** `o.Customer.Name` inside the `.Select()` projection touches a navigation property. If lazy loading proxies are enabled, EF Core issues a separate SELECT per order to fetch the related `Customer`. If lazy loading is disabled (the default in most .NET 6 setups), `o.Customer` is `null` and the projection throws `NullReferenceException` — or, combined with deferred execution, attempts the load after dispose.

**Fix:** Add `.Include(o => o.Customer)` before `.Where()` (CHANGE 3). This tells EF Core to JOIN the `Customers` table in the same SQL query, so `o.Customer` is populated when the projection runs inside `.ToList()`.

**Explanation:** EF Core does not automatically load related entities unless you explicitly ask for them. Without `.Include()`, `o.Customer` is a `null` navigation reference in a non-lazy-loading setup, so `o.Customer.Name` throws immediately when `.ToList()` iterates the results. With lazy loading proxies enabled the symptom shifts: EF Core tries to issue an extra SELECT for each `Customer` row, which works only while the context is alive — and fails with `ObjectDisposedException` when deferred. Using `.Include()` collapses all data retrieval into one query, eliminates the per-row extra round-trip, and guarantees the navigation property is populated regardless of whether lazy loading is on.
