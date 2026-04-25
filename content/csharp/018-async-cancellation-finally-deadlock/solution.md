## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Await in Finally Block Deadlocks
// ------------------------------------------------------------------------

public class StreamingReportService
{
    private readonly IAuditLog _audit;
    private readonly IReportGenerator _generator;
    private readonly ILogger<StreamingReportService> _logger;

    public StreamingReportService(
        IAuditLog audit,
        IReportGenerator generator,
        ILogger<StreamingReportService> logger)
    {
        _audit = audit;
        _generator = generator;
        _logger = logger;
    }

    public async Task StreamReportAsync(
        string reportId,
        Stream output,
        CancellationToken ct)
    {
        _logger.LogInformation("Starting report stream {ReportId}", reportId);
        try
        {
            await _generator.GenerateAsync(reportId, output, ct).ConfigureAwait(false);
        }
        finally
        {
            // CHANGE 1 & 2: Use CancellationToken.None so the audit write is never skipped because the request token is cancelled, and the await cannot throw OperationCanceledException due to client disconnect.
            // CHANGE 3: ConfigureAwait(false) prevents capturing the (potentially gone) SynchronizationContext, avoiding a deadlock when resuming after the await.
            await _audit.WriteAsync(reportId, "streamed", CancellationToken.None).ConfigureAwait(false);
            _logger.LogInformation("Audit written for {ReportId}", reportId);
        }

        _logger.LogInformation("Report stream complete {ReportId}", reportId);
    }
}
```

## Explanation

### Issue 1: Cancelled token skips audit log

**Problem:** When the client disconnects, the `CancellationToken ct` passed to the method is cancelled. Passing that same token to `_audit.WriteAsync` inside `finally` causes `WriteAsync` (or its internal `await`) to throw `OperationCanceledException` immediately. The `_logger.LogInformation("Audit written")` line never runs, and the audit record is never stored.

**Fix:** Replace `ct` with `CancellationToken.None` in the `_audit.WriteAsync(reportId, "streamed", CancellationToken.None)` call inside `finally`. The audit write now runs to completion regardless of the request token's state.

**Explanation:** A `CancellationToken` that is already cancelled causes any `await` that observes it to throw immediately rather than doing the work. Inside a `finally` block this is especially harmful: the block is supposed to run unconditionally as cleanup, but a cancelled token makes it bail out early. Using `CancellationToken.None` gives the audit operation its own unlinked token so it always runs. The tradeoff is that this audit write has no timeout of its own; if that matters, create a fresh `CancellationTokenSource` with a hard deadline and pass its token instead.

---

### Issue 2: Finally-block await deadlocks on client disconnect

**Problem:** After the client disconnects, ASP.NET Core marks the request `CancellationToken` as cancelled. `_generator.GenerateAsync` throws or returns, control enters `finally`, and `_audit.WriteAsync(... ct)` is awaited with an already-cancelled token. Depending on the `IAuditLog` implementation, the task either throws immediately (skipping cleanup) or — in some middleware stacks — the continuation is never scheduled because the infrastructure that drives cancelled-token continuations has already torn down. Either way the thread-pool thread blocks, never resumes, and the hang accumulates.

**Fix:** Pass `CancellationToken.None` to `_audit.WriteAsync` (the `CHANGE 1 & 2` site). This decouples the audit operation's lifetime from the request lifecycle so the continuation is always scheduled and the method always completes.

**Explanation:** The ASP.NET Core request pipeline cancels the request token when the HTTP connection closes. Any `await` on a task that checks that token transitions to a faulted/cancelled state immediately, so the continuation either throws or is never queued by the scheduler. Inside `finally`, you need the cleanup work to be independent of whatever caused the `try` body to exit. `CancellationToken.None` is the standard way to express "this work must finish regardless". A related pitfall: linking a new `CancellationTokenSource` to the original `ct` with `CreateLinkedTokenSource` would reproduce the same bug because the linked source is also already cancelled.

---

### Issue 3: Missing ConfigureAwait(false) in finally causes SynchronizationContext deadlock

**Problem:** In ASP.NET Core 6 integration tests (and in some middleware), a `SynchronizationContext` is installed. Without `ConfigureAwait(false)`, the `await` inside `finally` captures that context and tries to resume on it. If the context is blocked or has already been disposed after the client disconnect, the continuation is queued but never executed, and the method hangs permanently. This is why thread-pool starvation climbs gradually during load testing.

**Fix:** Add `.ConfigureAwait(false)` to the `await _audit.WriteAsync(...)` call in the `finally` block (the `CHANGE 3` site), matching the style already used on `_generator.GenerateAsync`.

**Explanation:** `await` without `ConfigureAwait(false)` posts the continuation back to the captured `SynchronizationContext`. In a live ASP.NET Core request this is usually fine, but when a client disconnects the context associated with that request can become invalid or blocked waiting for the same thread that is stuck in `finally`. `ConfigureAwait(false)` tells the runtime to resume on any available thread-pool thread instead, so the continuation is never gated on a potentially dead context. This is consistent with the existing `.ConfigureAwait(false)` on `_generator.GenerateAsync` — the `finally` block simply missed it.
