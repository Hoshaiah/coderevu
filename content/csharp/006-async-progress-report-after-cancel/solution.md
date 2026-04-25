## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Progress Callback After Task Cancelled
// ------------------------------------------------------------------------

public async Task ImportRowsAsync(
    IEnumerable<CsvRow> rows,
    IProgress<int> progress,
    CancellationToken ct)
{
    int processed = 0;

    foreach (var row in rows)
    {
        if (ct.IsCancellationRequested)
            break;

        // CHANGE 2: pass ct so SaveChangesAsync can be cancelled promptly when the client disconnects
        await ProcessRowAsync(row, ct);

        // CHANGE 3: re-check cancellation after the awaited work so we don't report progress on a cancelled connection
        if (ct.IsCancellationRequested)
            break;

        processed++;
        // CHANGE 1: progress.Report is now only reached when ct is not cancelled, preventing callbacks on a disposed hub connection
        progress.Report(processed);
    }
}

// CHANGE 2: accept CancellationToken and forward it to SaveChangesAsync
private async Task ProcessRowAsync(CsvRow row, CancellationToken ct)
{
    await _dbContext.SaveChangesAsync(ct);
}
```

## Explanation

### Issue 1: Progress Reported After Cancellation

**Problem:** When the client disconnects mid-import, the `break` exits the loop but only *before* calling `ProcessRowAsync`. If cancellation is requested while `ProcessRowAsync` is already running, the loop continues past it, increments `processed`, and calls `progress.Report`. That callback reaches the SignalR hub after the connection has been cleaned up, producing `ObjectDisposedException`.

**Fix:** A second `if (ct.IsCancellationRequested) break;` is inserted immediately after `await ProcessRowAsync(row, ct)` and before `processed++` and `progress.Report(processed)`. This ensures `progress.Report` is never reached on a connection that has already been torn down.

**Explanation:** The original single guard only catches cancellation at the *top* of each iteration. Any cancellation that arrives during the `await ProcessRowAsync(...)` call is invisible to that guard — the code just keeps going. Because `progress.Report` is a synchronous delegate that directly invokes the SignalR hub send, firing it after hub cleanup causes the observed exception. Adding the post-await check closes that window. A related pitfall: if `progress.Report` itself throws, the exception will propagate out of the loop, so callers should be prepared to catch `OperationCanceledException` or hub-related exceptions from this method.

---

### Issue 2: SaveChangesAsync Not Passed the CancellationToken

**Problem:** `ProcessRowAsync` calls `_dbContext.SaveChangesAsync()` with no token, so the database round-trip runs to completion regardless of whether the client has disconnected. Operators see the import job continuing for several seconds after cancellation because EF Core has no signal to abort the in-flight SQL command.

**Fix:** `ProcessRowAsync` gains a `CancellationToken ct` parameter, and the call becomes `await _dbContext.SaveChangesAsync(ct)`. The call site `await ProcessRowAsync(row, ct)` also passes the token through.

**Explanation:** `DbContext.SaveChangesAsync` has an overload that accepts a `CancellationToken` and passes it to the underlying ADO.NET `DbCommand.ExecuteNonQueryAsync`. When the token is cancelled, EF Core requests query cancellation from the database driver, which typically aborts the command promptly and throws `OperationCanceledException`. Without the token, EF Core uses `CancellationToken.None` internally, so the database command runs to completion and the method only returns after the full round-trip. For long-running imports with many rows, this compounds — each row's save holds the loop open well past the point the client gave up.

---

### Issue 3: Cancellation Not Re-Checked After Awaited Work

**Problem:** Cancellation can be signalled at any point during `await ProcessRowAsync(...)`. The original code has one guard at the start of the loop body, so a cancellation that arrives mid-await is only discovered at the *next* iteration's top-of-loop check. For long-running per-row operations this delay can be significant, and in the interim `progress.Report` is still called.

**Fix:** The second `if (ct.IsCancellationRequested) break;` added at CHANGE 3 immediately after the `await ProcessRowAsync(row, ct)` call acts as the re-check, preventing `progress.Report` from firing after a mid-await cancellation.

**Explanation:** Async methods suspend at each `await`. The CPU is free to set the cancellation token flag at any point while the continuation is queued. When `ProcessRowAsync` returns (even if it completed normally), the token may already be cancelled — the loop just doesn't know yet because the only check was at entry. The re-check closes that gap with minimal overhead: `ct.IsCancellationRequested` is a volatile bool read, not a syscall. Alternatively you could call `ct.ThrowIfCancellationRequested()` and handle `OperationCanceledException` at the caller, which is idiomatic in .NET, but the `break`-based pattern here keeps the existing control flow intact.
