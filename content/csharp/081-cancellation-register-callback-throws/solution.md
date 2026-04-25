## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationToken Callback Swallows Exception
// ------------------------------------------------------------------------

public class DatabaseSession : IDisposable
{
    private readonly IDbConnection _connection;
    private readonly ILogger<DatabaseSession> _logger;
    private readonly CancellationTokenRegistration _registration;
    private bool _disposed;

    public DatabaseSession(
        IDbConnection connection,
        ILogger<DatabaseSession> logger,
        CancellationToken shutdownToken)
    {
        _connection = connection;
        _logger = logger;

        // CHANGE 2: Pass useSynchronizationContext:false so the callback always runs on a thread-pool thread and never inherits a captured SynchronizationContext that could serialize or deadlock execution.
        _registration = shutdownToken.Register(() =>
        {
            // CHANGE 1: Wrap the callback body in try/catch so any exception from _connection.Close() is logged rather than silently swallowed, which would leave the shutdown pipeline hanging with no diagnostic output.
            try
            {
                _logger.LogInformation("Cancellation requested, closing session.");
                _connection.Close();
                _logger.LogInformation("Session closed.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception while closing session during cancellation.");
            }
        }, useSynchronizationContext: false);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _registration.Dispose();
        _connection.Dispose();
    }
}
```

## Explanation

### Issue 1: Unhandled Exception Swallowed in Callback

**Problem:** When `_connection.Close()` throws (e.g., a network timeout or an already-closed connection), the runtime swallows the exception inside the `CancellationToken.Register` callback and the rest of the callback body never runs. The log message `"Session closed"` never appears, and the `IHostedService.StopAsync` continuation that depends on the shutdown completing hangs indefinitely until the 5-second timeout fires — except the token itself is never observed as fully handled, so the host may wait forever.

**Fix:** Wrap the entire callback body in a `try/catch(Exception ex)` block (CHANGE 1) and call `_logger.LogError(ex, ...)` in the catch. This guarantees the callback always exits cleanly and the exception is surfaced in logs.

**Explanation:** `CancellationToken.Register` runs callbacks synchronously on whichever thread calls `CancellationTokenSource.Cancel`. If a callback throws, the runtime catches it internally and continues invoking other registered callbacks, but the original exception is discarded — there is no unhandled-exception event fired and no propagation back to the caller of `Cancel`. The result is that your code silently does nothing after the throw. Adding a `try/catch` means you get a log entry pointing to the real failure (e.g., `InvalidOperationException: Connection is already closed`) instead of a silent hang. A related pitfall: if you register multiple callbacks on the same token and one throws, the others still run — the swallowing is per-callback, not global.

---

### Issue 2: Captured SynchronizationContext Can Deadlock Callback

**Problem:** `CancellationToken.Register` has an overload that, by default, captures the current `SynchronizationContext` and posts the callback onto it. In ASP.NET or any single-threaded-scheduler environment, this means the callback is queued back to the same context that is currently blocked waiting for shutdown to complete. The callback never gets to run, and `StopAsync` hangs.

**Fix:** Pass `useSynchronizationContext: false` as the second argument to `shutdownToken.Register(...)` (CHANGE 2). This forces the callback to run directly on whichever thread calls `Cancel`, or on a thread-pool thread, bypassing any captured scheduler.

**Explanation:** When a `SynchronizationContext` is active (common in UI frameworks, older ASP.NET, and some test runners), `Register` captures it by default so that callback code runs in the "right" context. But if the thread driving that context is also the thread blocked in `StopAsync` waiting for cancellation to propagate, the callback is queued to a context that can never drain — a classic single-threaded deadlock. Passing `useSynchronizationContext: false` opts out of that capture entirely: the callback runs inline on the cancelling thread (or a pool thread) and is never re-posted. For infrastructure teardown code like closing a database connection, running outside the original context is always safe and avoids this class of hang.
