## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Lazy navigation property access inside a loop issues N+1 database queries
// ------------------------------------------------------------------------
public class DispatchReportService
{
    private readonly AppDbContext _db;

    public DispatchReportService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<DispatchLine>> GetReportAsync(DateTime date)
    {
        // CHANGE 1: Added .Include(o => o.Customer) so EF Core fetches all Customer rows in a single JOIN query instead of issuing one SELECT per order in the loop.
        // CHANGE 2: Replaced .Where(o => o.PlacedAt.Date == date.Date) with a half-open date-range predicate that translates reliably to a SQL BETWEEN / >= < comparison, avoiding any client-side evaluation or function-based filtering that can bypass indexes.
        var startOfDay = date.Date;
        var startOfNextDay = date.Date.AddDays(1);
        var orders = await _db.Orders
            .Include(o => o.Customer) // CHANGE 1
            .Where(o => o.PlacedAt >= startOfDay && o.PlacedAt < startOfNextDay) // CHANGE 2
            .ToListAsync();

        var lines = new List<DispatchLine>();
        foreach (var order in orders)
        {
            // Customer is now already loaded in memory — no additional query fires here.
            lines.Add(new DispatchLine(
                order.Id,
                order.Customer.Name,
                order.Customer.ShippingAddress,
                order.TotalAmount
            ));
        }

        return lines;
    }
}
```

## Explanation

### Issue 1: Lazy-load inside loop causes N+1 queries

**Problem:** With 3 000 orders, the endpoint issues 3 001 SELECT statements: one to fetch the orders list, then one more for each `order.Customer` access inside the `foreach`. SQL profiling shows thousands of individual queries and the endpoint times out for large customers.

**Fix:** Add `.Include(o => o.Customer)` to the LINQ query before `.ToListAsync()`. EF Core translates this into a single SQL JOIN (or a second batched query, depending on the provider), so all `Customer` data arrives with the initial load.

**Explanation:** EF Core's lazy loading works by generating a proxy that intercepts property access and runs a `SELECT` on demand. Inside a loop over 3 000 orders, each access to `order.Customer` triggers its own round-trip to the database. Eager loading with `.Include()` tells EF Core to include the related entity in the same query, so by the time the loop runs, `order.Customer` is already populated in the change tracker's identity map and no database call is made. One edge case to keep in mind: if orders can reference many distinct customers, the JOIN result set grows wide but still costs far less than 3 000 separate round-trips. If the relationship were a collection (`order.OrderItems`) you would need `.AsSplitQuery()` or a separate load to avoid row duplication in the result set.

---

### Issue 2: `.Date` property comparison may not translate to SQL correctly

**Problem:** `o.PlacedAt.Date == date.Date` calls the `.Date` property on a `DateTime` column inside a LINQ `Where` clause. Depending on the EF Core version and database provider, this may not translate to SQL at all and can fall back to client-side evaluation — meaning EF Core pulls every order row across the wire and then filters them in .NET memory, or it throws a runtime translation error.

**Fix:** Replace the `.Date` comparison with a half-open range: `o.PlacedAt >= startOfDay && o.PlacedAt < startOfNextDay`, where `startOfDay = date.Date` and `startOfNextDay = date.Date.AddDays(1)`. These are simple `>=` and `<` comparisons that every SQL provider translates directly and that can use an index on `PlacedAt`.

**Explanation:** EF Core translates LINQ expressions to SQL by pattern-matching known .NET methods and properties against a provider-specific translation table. `DateTime.Date` is recognized by some providers (SQL Server via `CONVERT(date, ...)`) but not all, and the translation can change across EF Core versions. A range predicate using `>=` and `<` on the original `DateTime` column is universally supported, uses the column's index efficiently, and captures all timestamps within the target day regardless of time component. Using `AddDays(1)` on the boundary keeps the logic correct even for the last millisecond of the day without needing `<=` on a truncated value.
