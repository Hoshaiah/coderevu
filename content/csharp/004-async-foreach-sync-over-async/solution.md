## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Sync Block Inside Async Foreach
// ------------------------------------------------------------------------

public class ReportExporter : BackgroundService
{
    private readonly IReportClient _client;
    private readonly IBlobStorage _storage;
    private readonly ILogger<ReportExporter> _logger;

    public ReportExporter(
        IReportClient client,
        IBlobStorage storage,
        ILogger<ReportExporter> logger)
    {
        _client = client;
        _storage = storage;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var reportIds = await _client.GetReportIdsAsync(stoppingToken);

        foreach (var id in reportIds)
        {
            // CHANGE 2: honour the cancellation token so the loop exits promptly when the host shuts down instead of grinding through every remaining report.
            stoppingToken.ThrowIfCancellationRequested();

            // CHANGE 1: await the Task instead of blocking with .Result; blocking here deadlocks because the ASP.NET Core SynchronizationContext needs this thread to resume the continuation.
            var data = await _client.FetchReportAsync(id, stoppingToken);
            await _storage.WriteAsync(id, data, stoppingToken);
        }

        _logger.LogInformation("All reports exported.");
    }
}
```

## Explanation

### Issue 1: Sync Block Inside Async Method Causes Deadlock

**Problem:** The worker hangs indefinitely after the first report is written. CPU drops to zero, memory creeps up, and the completion log line never appears. Killing the process and restarting reproduces it every time on the second iteration of the loop.

**Fix:** Replace `_client.FetchReportAsync(id, stoppingToken).Result` with `await _client.FetchReportAsync(id, stoppingToken)`. The `.Result` call is removed and `await` is used in its place.

**Explanation:** ASP.NET Core (and many other hosts) installs a `SynchronizationContext` that schedules continuations back onto a specific context. When you call `.Result` on a `Task`, the calling thread blocks waiting for the task to finish. The task's continuation, however, needs to be scheduled back onto that same context — but the context is occupied by the blocked thread. Neither side can proceed, so the process hangs indefinitely. This is a deadlock that happens specifically on the second iteration because the first call to `FetchReportAsync` completes before the loop re-enters (the initial `await` at the top of `ExecuteAsync` has already set up the synchronization state). Using `await` instead of `.Result` releases the thread back to the context while the HTTP call is in flight, so the continuation can be scheduled without contention. A related pitfall is calling `.GetAwaiter().GetResult()` — it blocks in exactly the same way and produces the same deadlock.

---

### Issue 2: Loop Ignores CancellationToken

**Problem:** When the host shuts down and signals `stoppingToken`, the loop does not react. It continues to fetch and write every remaining report, delaying graceful shutdown and potentially causing in-flight writes to be abandoned mid-stream rather than at a clean boundary.

**Fix:** Add `stoppingToken.ThrowIfCancellationRequested()` at the top of the loop body, immediately before the `await _client.FetchReportAsync` call.

**Explanation:** Passing `stoppingToken` to `FetchReportAsync` and `WriteAsync` only cancels those individual operations while they are actively awaiting I/O. Between iterations the token is never observed, so if cancellation fires while control is between two awaits, the loop proceeds to start another HTTP request anyway. Calling `ThrowIfCancellationRequested()` at the start of each iteration makes the loop check the token at a well-defined, safe point — after a complete write and before the next fetch begins. This means no report is left half-written in blob storage. The `OperationCanceledException` thrown propagates out of `ExecuteAsync`, which `BackgroundService` treats as a normal shutdown signal.
