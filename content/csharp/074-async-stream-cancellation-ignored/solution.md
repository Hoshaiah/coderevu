## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationToken Dropped in Async Stream
// ------------------------------------------------------------------------

public async Task ExportReportAsync(
    IAsyncEnumerable<ReportRow> rows,
    Stream destination,
    CancellationToken cancellationToken)
{
    await using var writer = new StreamWriter(destination, leaveOpen: true);

    // CHANGE 2: Pass cancellationToken to WriteLineAsync so the header write respects shutdown.
    await writer.WriteLineAsync("Id,Name,Amount,Date".AsMemory(), cancellationToken);

    // CHANGE 1: Call WithCancellation so the async enumerator checks the token between rows.
    await foreach (var row in rows.WithCancellation(cancellationToken))
    {
        var line = $"{row.Id},{row.Name},{row.Amount},{row.Date:yyyy-MM-dd}";
        // CHANGE 2: Pass cancellationToken to WriteLineAsync so each row write respects shutdown.
        await writer.WriteLineAsync(line.AsMemory(), cancellationToken);
    }

    // CHANGE 3: Pass cancellationToken to FlushAsync so the final flush respects shutdown.
    await writer.FlushAsync(cancellationToken);
}
```

## Explanation

### Issue 1: CancellationToken dropped in `await foreach`

**Problem:** When the application shuts down, the cancellation token fires but the loop keeps iterating. The async enumerable (`IAsyncEnumerable<ReportRow>`) checks for cancellation only if the caller passes the token via `WithCancellation`. Without it, the enumerator never sees the signal, and the loop runs to completion — or until the pod is force-killed.

**Fix:** Chain `.WithCancellation(cancellationToken)` on the `rows` sequence inside the `await foreach` at CHANGE 1. This wires the token into the `IAsyncEnumerator.MoveNextAsync` call on every iteration.

**Explanation:** `IAsyncEnumerable<T>` sources (like EF Core queries or custom iterators) receive the cancellation token through `IAsyncEnumerator<T>.GetAsyncEnumerator(CancellationToken)`. The `await foreach` compiler expansion calls `GetAsyncEnumerator` at the start of the loop. Without `WithCancellation`, it passes `CancellationToken.None` regardless of what token the caller holds. With `WithCancellation`, the compiler-generated call passes the real token, so sources that respect it (EF Core, Channel readers, etc.) stop producing rows immediately when cancellation is requested. A related pitfall: if the enumerable source ignores the token internally (e.g., a plain `yield return` loop with no `cancellationToken.ThrowIfCancellationRequested()` inside), you still need the checks in the loop body — but most infrastructure sources do honour it.

---

### Issue 2: CancellationToken dropped in `WriteLineAsync`

**Problem:** Even if the `await foreach` is fixed, each call to `WriteLineAsync` can still block for the duration of an I/O operation with no way to abort it early. On a slow or back-pressured blob stream this can add several seconds per row after cancellation fires.

**Fix:** Replace `writer.WriteLineAsync(line)` (and the header write) with `writer.WriteLineAsync(line.AsMemory(), cancellationToken)` at CHANGE 2. The `ReadOnlyMemory<char>` overload of `WriteLineAsync` is the one that accepts a `CancellationToken`; the `string` overload does not.

**Explanation:** `StreamWriter` exposes two `WriteLineAsync` signatures: one taking a `string` (no token) and one taking `ReadOnlyMemory<char>` plus a `CancellationToken`. Calling the `string` overload means cancellation is never checked during the write itself. Converting with `.AsMemory()` picks the correct overload. If the underlying stream's `WriteAsync` respects the token (Azure Blob Storage streams do), the write will throw `OperationCanceledException` as soon as the token fires mid-write, which is exactly the behaviour needed for a clean shutdown.

---

### Issue 3: CancellationToken dropped in `FlushAsync`

**Problem:** After the loop, `writer.FlushAsync()` is called without the token. If cancellation has already been requested, the flush still runs to completion, which can take measurable time when flushing a large internal buffer to a remote blob stream.

**Fix:** Replace `writer.FlushAsync()` with `writer.FlushAsync(cancellationToken)` at CHANGE 3.

**Explanation:** `StreamWriter.FlushAsync` has an overload that accepts a `CancellationToken` (added in .NET 6). Passing the token lets the flush be aborted if the application is already shutting down at the point the loop finishes. This matters because large rows or many buffered characters can make the flush non-trivial. A related pitfall: if you are targeting a .NET version older than 6, `FlushAsync(CancellationToken)` is not available on `StreamWriter` — in that case you would guard the call with `cancellationToken.ThrowIfCancellationRequested()` before calling the no-token overload.
