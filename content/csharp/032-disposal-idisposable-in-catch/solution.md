## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Disposable Not Cleaned Up in Catch
// ------------------------------------------------------------------------

public class BulkImporter
{
    private readonly string _connectionString;
    private readonly ILogger<BulkImporter> _logger;

    public BulkImporter(string connectionString, ILogger<BulkImporter> logger)
    {
        _connectionString = connectionString;
        _logger = logger;
    }

    public async Task ImportAsync(IDataReader reader, CancellationToken ct)
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        // CHANGE 1: wrap SqlBulkCopy in a using statement so it is disposed on every exit path, including exceptions, releasing server-side bulk-copy resources and any internal transaction.
        using var bulkCopy = new SqlBulkCopy(connection);
        bulkCopy.DestinationTableName = "dbo.ImportedRows";

        try
        {
            // CHANGE 2: pass the CancellationToken to WriteToServerAsync so a cancelled job aborts the network operation promptly and does not hold the connection open.
            await bulkCopy.WriteToServerAsync(reader, ct);
            _logger.LogInformation("Bulk import completed.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Bulk import failed.");
            throw;
        }
    }
}
```

## Explanation

### Issue 1: `SqlBulkCopy` Never Disposed

**Problem:** After a failed `WriteToServerAsync` call the `SqlBulkCopy` object is not disposed. Operators see the SQL Server connection pool exhausted after a few retries, and all subsequent database access in the process fails with pool-timeout errors.

**Fix:** Add `using` to the `SqlBulkCopy` declaration (`using var bulkCopy = new SqlBulkCopy(connection);`). This is CHANGE 1 in the reference solution.

**Explanation:** `SqlBulkCopy` implements `IDisposable`. When you dispose it, it closes the server-side bulk-copy session and cleans up its internal state. Without the `using`, an exception thrown inside `WriteToServerAsync` unwinds the stack past the `catch` block, but the `bulkCopy` variable goes out of scope without `Dispose` being called. The `using var connection` above it does eventually dispose the connection, but only after the scope of `ImportAsync` exits — and in between, the `SqlBulkCopy` may hold a server-side lock or consume additional connection pool slots depending on the overload used. On each Hangfire retry a new instance is created without the old one being cleaned up, so the leak compounds. Wrapping `SqlBulkCopy` in a `using` guarantees `Dispose` runs even when an exception propagates past the `catch`.

---

### Issue 2: `CancellationToken` Not Forwarded to `WriteToServerAsync`

**Problem:** When Hangfire cancels a job (e.g., on shutdown or timeout), the `CancellationToken` passed to `ImportAsync` is signalled, but the bulk copy operation continues running to completion or until a network error occurs. The connection is held open for the full duration, delaying pool slot release.

**Fix:** Change `await bulkCopy.WriteToServerAsync(reader)` to `await bulkCopy.WriteToServerAsync(reader, ct)`, passing the `CancellationToken` as the second argument. This is CHANGE 2 in the reference solution.

**Explanation:** `SqlBulkCopy.WriteToServerAsync` has an overload that accepts a `CancellationToken`. When you call the zero-token overload, cancellation of the caller has no effect on the underlying TDS network send loop. Passing `ct` lets the ADO.NET runtime abort the in-flight network operation and throw `OperationCanceledException` as soon as the token is signalled. This means the connection is returned to the pool promptly rather than staying busy for the remainder of a potentially large bulk copy. One related pitfall: if you catch `OperationCanceledException` generically as `Exception`, make sure you still `throw` it (as this code already does) so the Hangfire framework knows the job was cancelled and does not count it as a retriable failure.
