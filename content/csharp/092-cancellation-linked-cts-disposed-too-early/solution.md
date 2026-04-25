## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Linked CancellationTokenSource Disposed Mid-Operation
// ------------------------------------------------------------------------

public async Task<SearchResult> HandleAsync(
    SearchRequest request,
    CancellationToken requestCt)
{
    // CHANGE 1: Move linkedCts outside the using block (or use try/finally) so it stays alive for the entire awaited operation; disposing it before ExecuteAsync finishes kills mergedToken mid-flight.
    using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
        requestCt,
        _appShutdownCt);

    // CHANGE 2: CancelAfter is still set the same way, but now the CTS is not disposed until after ExecuteAsync completes, so the timer firing no longer tears down the token while the HTTP call is in progress.
    linkedCts.CancelAfter(TimeSpan.FromSeconds(5));

    return await _searchService.ExecuteAsync(request, linkedCts.Token);
}
```

## Explanation

### Issue 1: CTS Disposed Before Awaited Work Completes

**Problem:** In production, any search query that takes more than a few milliseconds throws `ObjectDisposedException: The CancellationTokenSource has been disposed` inside `SearchService.ExecuteAsync`. The error appears mid-HTTP-call, not at shutdown, because the `CancellationToken` passed to `ExecuteAsync` is backed by a `CancellationTokenSource` that has already been disposed.

**Fix:** Remove the inner `using` block and replace it with a `using var` declaration (CHANGE 1) so that `linkedCts` is scoped to the entire method body and is only disposed after the `await` returns.

**Explanation:** A `CancellationToken` is a lightweight struct, but it holds a reference back to its parent `CancellationTokenSource`. When you call `Dispose()` on the CTS, the internal `WaitHandle` and registration lists are torn down. Any code that later tries to check `token.IsCancellationRequested`, register a callback, or respond to cancellation will touch that freed state and throw `ObjectDisposedException`. In the buggy code, the `using` block ends — and therefore `Dispose()` runs — on the closing brace before `ExecuteAsync` is ever called. Fast queries never hit this because they presumably finished in a test or different code path; in practice any call reaches `ExecuteAsync` after the `}` closes the `using`. Moving to `using var` ties the lifetime of `linkedCts` to the enclosing method scope, so `Dispose()` is not called until the method exits, which is after the `await` completes or throws.

---

### Issue 2: CancelAfter Timer Can Fire While Token Is Still In Use

**Problem:** Even if the disposal order were corrected naively (e.g., by moving `ExecuteAsync` inside the `using` block), the 5-second `CancelAfter` timer raises cancellation and then — when the `using` block exits — disposes the CTS. If the downstream call is still running as the timeout fires and the `using` block closes simultaneously, code that reacts to the cancellation token (re-registrations, polling `IsCancellationRequested`) can race against the disposal.

**Fix:** CHANGE 2 keeps `CancelAfter` on the same line but, because `linkedCts` is now a `using var` at method scope, the CTS remains valid for the full duration of `ExecuteAsync`, including the window after the timeout fires and before the await returns or throws.

**Explanation:** `CancelAfter` schedules an internal `Timer` that calls `Cancel()` after the specified delay. `Cancel()` itself is safe to call on a live CTS — it signals the token, runs registered callbacks, and returns. The problem arises only if `Dispose()` races with or precedes that window. With `using var` at method scope, `Dispose()` is deferred to after the `await`, so the CTS is always alive when `Cancel()` fires. A related pitfall: if you manually call `linkedCts.Dispose()` in a `finally` block before awaiting a continuation that holds the token, you get the same race — always ensure the CTS outlives every consumer of its token.
