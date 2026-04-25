## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Interpolated SQL string allows injection and leaks arbitrary data
// ------------------------------------------------------------------------
public class ProductRepository
{
    private readonly IDbConnection _db;

    public ProductRepository(IDbConnection db)
    {
        _db = db;
    }

    public async Task<IEnumerable<Product>> SearchAsync(string searchTerm)
    {
        // CHANGE 2: Reject null/empty input early so a null searchTerm cannot reach the database and a blank search does not trigger a full table scan.
        if (string.IsNullOrWhiteSpace(searchTerm))
            return Enumerable.Empty<Product>();

        // CHANGE 1: Replace string interpolation with a parameterised query. Dapper binds @SearchTerm safely; the database driver handles escaping, so no user-supplied text ever becomes part of the SQL command itself.
        var sql = "SELECT Id, Name, Price FROM Products "
                + "WHERE Name LIKE @SearchTerm "
                + "ORDER BY Name";

        // CHANGE 1 (continued): Pass the wildcard pattern as the parameter value,
        // not inside the SQL string, so the driver treats it as data, not syntax.
        return await _db.QueryAsync<Product>(sql, new { SearchTerm = $"%{searchTerm}%" });
    }
}
```

## Explanation

### Issue 1: SQL Injection via String Interpolation

**Problem:** The query is built by embedding `searchTerm` directly into the SQL string with C# string interpolation. An attacker who sends `'; SELECT * FROM users--` as the search term causes the database to execute two statements: the intended product search and an arbitrary `SELECT` against the `users` table. Any SQL the attacker can write gets executed with the application's database credentials.

**Fix:** Replace the interpolated string with a fixed SQL string containing the named parameter `@SearchTerm`, and pass the wildcard-wrapped value through Dapper's anonymous-object parameter argument: `new { SearchTerm = $"%{searchTerm}%" }`. The `$"..."` interpolation now only constructs a data value, never SQL syntax.

**Explanation:** When user input sits inside the SQL string itself, the database parser cannot distinguish it from SQL keywords. The driver sees one long string of text and executes whatever commands it finds in it. Parameterised queries send the SQL template and the parameter values separately over the wire. The database binds the value to a placeholder after parsing the query structure, so quotes or SQL keywords inside the value are treated as literal characters. A related pitfall: the `LIKE` wildcard characters `%` and `_` inside `searchTerm` still have meaning inside a `LIKE` pattern, so if you need to prevent users from crafting arbitrary wildcard patterns you should also escape those characters before concatenating them into the parameter value.

---

### Issue 2: Missing Input Validation Allows Null and Degenerate Inputs

**Problem:** If `searchTerm` is `null`, the original code produces the SQL string `WHERE Name LIKE '%null%'` (because C# string interpolation calls `ToString()` on null, yielding an empty string in some runtimes, or throws a `NullReferenceException` in others). An empty or whitespace-only search term triggers a full table scan with `LIKE '%%'`, which returns every row and can be expensive on large tables.

**Fix:** Add an early-return guard using `string.IsNullOrWhiteSpace(searchTerm)` that returns `Enumerable.Empty<Product>()` before the query runs. This is placed at the top of `SearchAsync`, before any SQL is constructed.

**Explanation:** The database has no way to reject a query that is structurally valid but semantically meaningless, like `LIKE '%%'`. That query reads the entire `Products` table, applies no filter, and returns every row. On a table with millions of rows this can saturate I/O and exhaust the connection pool. Checking for null or whitespace in application code is cheap and keeps obviously useless requests out of the database entirely. If your business rules require returning all products on an empty search, centralise that decision here rather than letting it fall through to an unfiltered scan.
