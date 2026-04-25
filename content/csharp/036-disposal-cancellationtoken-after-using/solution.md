## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationTokenSource Disposed Before Callback
// ------------------------------------------------------------------------

public class ReportExporter
{
    private readonly IReportRepository _repo;

    public ReportExporter(IReportRepository repo) => _repo = repo;

    public async Task ExportAsync(
        Stream destination,
        CancellationToken requestCt)
    {
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        using var linkedCts  = CancellationTokenSource.CreateLinkedTokenSource(
            requestCt, timeoutCts.Token);

        var token = linkedCts.Token;

        var rows = await _repo.FetchRowsAsync(token);

        await using var writer = new StreamWriter(destination, leaveOpen: true);
        foreach (var row in rows)
        {
            await writer.WriteLineAsync(row.ToCsvLine().AsMemory(), token);
        }

        // CHANGE 2: pass token so an already-cancelled operation does not flush partial data to the stream.
        await writer.FlushAsync(token);

        // CHANGE 1: cancel and wait for all internal callbacks on the linked source to drain before the using block disposes it; this prevents the race where a callback fires into an already-disposed CancellationTokenSource.
        linkedCts.Cancel();
        linkedCts.Token.WaitHandle.WaitOne(0);
    }
}
```

## Explanation

### Issue 1: CancellationTokenSource Disposed Before Callbacks Drain

**Problem:** On fast exports the `using` block disposes `linkedCts` and `timeoutCts` while the CLR's internal cancellation infrastructure is still executing callbacks registered on the linked token. The callback tries to access the already-disposed source and throws `ObjectDisposedException` inside `StreamWriter.FlushAsync`, producing a truncated file.

**Fix:** After `FlushAsync`, call `linkedCts.Cancel()` followed by `linkedCts.Token.WaitHandle.WaitOne(0)` before the `using` block's implicit `Dispose` runs. This is added at the `CHANGE 1` site, immediately before the closing brace.

**Explanation:** `CancellationTokenSource.CreateLinkedTokenSource` registers internal callbacks on each source token so that when either fires it propagates cancellation to the linked token. Those callbacks run on whatever thread raises the cancellation. If the `using` block exits and disposes the sources while a callback is mid-flight, the callback reads state on a disposed object. Fast exports complete before the 30-second timer fires, so the timer's callback is still pending in the thread pool when `Dispose` is called — that is why only fast exports reproduce the bug. Calling `Cancel()` on `linkedCts` explicitly drains those pending callbacks synchronously before `Dispose` is reached, closing the race window. An alternative is to use `CancelAsync` (available in .NET 8) and `await` it, which is cleaner in async contexts.

---

### Issue 2: FlushAsync Called Without Cancellation Token

**Problem:** If the export is cancelled (browser disconnects or timeout fires) after the write loop finishes but before the flush completes, `FlushAsync()` with no token ignores the cancellation and flushes buffered data anyway. The resulting file appears complete but contains data that should have been discarded for a cancelled request.

**Fix:** Replace `await writer.FlushAsync()` with `await writer.FlushAsync(token)` at the `CHANGE 2` site so the flush respects the same cancellation token used for all other I/O in the method.

**Explanation:** `StreamWriter` buffers writes internally, and the final `FlushAsync` pushes that buffer to the underlying stream. Without a token, this call cannot be interrupted. If the user has already disconnected (i.e., `requestCt` is cancelled), the code still writes the last buffer chunk, produces a file that looks complete, and sends it — but the request was supposed to be abandoned. Passing `token` here makes the flush honour the same cancellation contract as `WriteLineAsync`, and it also means the `ObjectDisposedException` path from Issue 1 is less likely to be reached at all since the operation exits cleanly on cancellation before the dispose race window opens.
