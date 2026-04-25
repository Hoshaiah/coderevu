## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — LINQ Project Before Filter Loads All Rows
// ------------------------------------------------------------------------

public class CustomerRepository
{
    private readonly AppDbContext _db;

    public CustomerRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<string>> GetActiveCustomerEmailsAsync()
    {
        return await _db.Customers
            // CHANGE 1: Move .Where() before any projection so EF Core translates it to a SQL WHERE clause; keeps the query as IQueryable.
            .Where(c => c.IsActive)
            // CHANGE 2: Project to only the Email column after filtering, still on IQueryable so this becomes SELECT Email in SQL.
            .Select(c => c.Email)
            .ToListAsync();
    }
}
```

## Explanation

### Issue 1: `AsAsyncEnumerable` Forces Premature Query Execution

**Problem:** Every call to `GetActiveCustomerEmailsAsync` fetches every row in the `Customers` table into the API server's memory. SQL profiling shows no `WHERE` clause in the query plan, and memory spikes on the server during each batch run.

**Fix:** Remove the `.AsAsyncEnumerable()` call entirely (CHANGE 1). Keep the entire query as `IQueryable<T>` by placing `.Where()` and `.Select()` directly on `_db.Customers` before calling `ToListAsync()`.

**Explanation:** EF Core builds a SQL query by accumulating `IQueryable` operators and translating them all at once when a terminal method like `ToListAsync()` is called. `.AsAsyncEnumerable()` is a terminal — it materializes the current query immediately, returning an `IAsyncEnumerable<T>` of in-memory objects. Any operators chained after that point (`.Where()`, `.Select()`) run as C# LINQ-to-Objects loops, not as SQL. By removing `.AsAsyncEnumerable()`, every operator stays in the `IQueryable` pipeline and EF Core can translate the full expression tree into a single efficient SQL statement. A related pitfall is `.AsEnumerable()`, which has exactly the same effect in synchronous contexts.

---

### Issue 2: Filter and Projection Applied In-Process Instead of in SQL

**Problem:** Because `.Where(c => c.IsActive)` runs after `.AsAsyncEnumerable()`, it executes as a C# predicate on every deserialized row, not as a SQL `WHERE` clause. The database does a full table scan, and the API discards inactive rows only after receiving them all.

**Fix:** Place `.Where(c => c.IsActive)` directly on `_db.Customers` (CHANGE 1) and chain `.Select(c => c.Email)` on the resulting `IQueryable` (CHANGE 2), before any call that materializes the query.

**Explanation:** EF Core's query translator walks the `IQueryable` expression tree and converts supported operators into SQL fragments. `.Where()` on an `IQueryable<Customer>` becomes `WHERE IsActive = 1` in the generated SQL, and `.Select(c => c.Email)` becomes `SELECT Email`, so only matching email strings travel over the network. When those operators are applied to an `IAsyncEnumerable<T>`, EF Core never sees them — they are plain delegate calls on already-fetched objects. Moving both operators before `ToListAsync()` means a single SQL statement does all filtering and column selection on the database server, where indexes can be used and network transfer is minimal.
