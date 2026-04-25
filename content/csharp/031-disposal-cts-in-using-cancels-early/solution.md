## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationTokenSource Disposed Before Task Completes
// ------------------------------------------------------------------------

public class DataIngestionJob : IJob
{
    private readonly IApiClient _api;
    private readonly AppDbContext _db;
    private readonly ILogger<DataIngestionJob> _logger;

    public DataIngestionJob(IApiClient api, AppDbContext db, ILogger<DataIngestionJob> logger)
    {
        _api = api;
        _db = db;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        // CHANGE 1: Removed the `using var cts` declaration that caused a second disposal; now the single `await using` block owns the lifetime of cts for the entire method scope.
        await using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(20));
        var token = cts.Token;

        var records = await _api.FetchAllAsync(token);
        _logger.LogInformation("Fetched {Count} records.", records.Count);

        foreach (var record in records)
        {
            _db.Records.Add(record);
        }

        // CHANGE 2: Removed the redundant inner `await using (cts)` block that disposed the CancellationTokenSource while SaveChangesAsync was still holding a reference to `token`.
        await _db.SaveChangesAsync(token);

        _logger.LogInformation("Ingestion complete.");
    }
}
```

## Explanation

### Issue 1: Double-Disposal of CancellationTokenSource

**Problem:** The job throws `ObjectDisposedException: The CancellationTokenSource has been disposed` inside `SaveChangesAsync` on roughly 30% of runs, always when record volumes are higher and the save takes longer.

**Fix:** Remove the redundant `await using (cts)` block that wraps `SaveChangesAsync`, and change the outer declaration from `using var cts` to `await using var cts` so that a single ownership point controls the lifetime of the `CancellationTokenSource` for the whole method.

**Explanation:** The original code creates `cts` with `using var`, which schedules its disposal when `Execute` returns. It then opens a second `await using (cts)` block around the save call. `await using` calls `DisposeAsync` (or `Dispose`) immediately when the block exits — which happens as soon as `SaveChangesAsync` returns its `Task`, before that task is awaited to completion. So at the moment the database write is in flight, `cts` has already been disposed, and the underlying `CancellationToken` that EF Core holds becomes invalid. High record volumes make the save take longer, widening the window and explaining the volume-correlated failure rate. The fix gives `cts` exactly one disposal path: the `await using var` declaration at the top of the method, which disposes only after the entire `Execute` method body finishes.

---

### Issue 2: CancellationToken Passed to Async Operation Whose CancellationTokenSource Is Disposed Mid-Await

**Problem:** Even if only one disposal path existed, any `await`ed async operation (like `SaveChangesAsync`) that receives a `CancellationToken` will throw `ObjectDisposedException` if the source is disposed while the operation is still running — not just when cancellation is actually requested.

**Fix:** By keeping the single `await using var cts` declaration alive for the full scope of `Execute`, the `CancellationTokenSource` is guaranteed to outlive every `await` that uses `token`, including `_api.FetchAllAsync(token)` and `_db.SaveChangesAsync(token)`.

**Explanation:** `CancellationToken` is a struct that holds a reference back to its parent `CancellationTokenSource`. When async infrastructure (EF Core, HttpClient, etc.) registers a callback on the token to detect cancellation, that registration touches the source. If the source is disposed, those registrations throw `ObjectDisposedException` regardless of whether cancellation was ever signaled. The `await using var` at the top of the method means the compiler-generated state machine keeps `cts` alive until the last `await` in `Execute` completes and the method returns. A related pitfall: never pass a token from a `CancellationTokenSource` that is scoped to a shorter lifetime than the operation consuming it — e.g., creating a linked `CancellationTokenSource` in a helper and disposing it before the caller's `await` finishes.
