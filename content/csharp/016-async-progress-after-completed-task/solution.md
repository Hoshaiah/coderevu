## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Progress Reported After Task Completes
// ------------------------------------------------------------------------

public async Task ProcessFileAsync(
    Stream fileStream,
    IProgress<int> progress,
    CancellationToken ct)
{
    var lines = new List<string>();
    using var reader = new StreamReader(fileStream);

    while (!reader.EndOfStream)
    {
        ct.ThrowIfCancellationRequested();
        lines.Add(await reader.ReadLineAsync());
    }

    int processed = 0;
    foreach (var line in lines)
    {
        ct.ThrowIfCancellationRequested();
        await ProcessLineAsync(line, ct);
        processed++;
        int pct = (int)((double)processed / lines.Count * 100);
        // CHANGE 1: Call progress.Report directly and inline instead of via Task.Run so it executes synchronously on the current (request-scoped) thread before the scope is torn down, preventing ObjectDisposedException from the disposed IServiceProvider.
        // CHANGE 2: Because we now call Report directly (no lambda), `pct` is read immediately at its current value, eliminating the variable-capture race where the lambda could read a later iteration's `pct`.
        progress.Report(pct);
    }
}
```

## Explanation

### Issue 1: Progress Reported After Request Scope Disposed

**Problem:** The app logs `System.ObjectDisposedException: IServiceProvider has been disposed` or `NullReferenceException` originating inside the `IProgress<int>.Report` callback. This happens only for files that take several seconds to process, and it is always in the progress callback, never in the main loop.

**Fix:** Replace `_ = Task.Run(() => progress.Report(pct));` with a direct synchronous call `progress.Report(pct);` at CHANGE 1. This removes the thread-pool dispatch entirely.

**Explanation:** The `IProgress<int>` instance was created by the SignalR hub and captures the `HttpContext` and the DI service scope of the incoming HTTP request. When `Task.Run` schedules the lambda on a thread-pool thread, that thread may execute after the `await ProcessFileAsync(...)` call returns in the hub and the request scope is torn down by ASP.NET Core's middleware. At that point the captured `HttpContext` is null or the `IServiceProvider` is disposed, so any service resolved inside `Report` throws. Because the callback is fire-and-forget (`_ = Task.Run(...)`), the caller never awaits completion; the work races against scope teardown. Calling `progress.Report(pct)` directly and synchronously ensures it runs on the same logical flow as the rest of the loop, well before the request scope ends. If `Report` itself is async internally, the `IProgress<T>` contract still guarantees the callback completes before `Report` returns when called synchronously from a `SynchronizationContext`-aware implementation.

---

### Issue 2: Lambda Captures Mutable Loop Variable

**Problem:** Even if the scope-disposal bug were absent, the lambda `() => progress.Report(pct)` closes over the local variable `pct`, which is overwritten on every loop iteration. A thread-pool thread could execute the lambda after one or more subsequent iterations have already run, reporting the wrong (later) percentage rather than the one that existed when the task was queued.

**Fix:** The direct call `progress.Report(pct);` at CHANGE 2 reads `pct` immediately at the current iteration's value — no lambda, no closure, no deferred capture.

**Explanation:** In C#, a lambda captures the variable itself, not the value at the moment the lambda is created. `pct` is declared inside the loop body, so each iteration creates a fresh variable — which is safer than capturing an outer variable — but the problem is the uncontrolled scheduling delay. If the thread pool is busy, the lambda for iteration 10 might run after iterations 11–20 have already updated their own `pct` locals; however, because each iteration's `pct` is a distinct local, the value is actually stable per iteration in this code. The real danger is that the lambdas execute out of order relative to the main loop, so progress can jump backwards or skip values. Calling `Report` directly ensures progress is reported in strict order, one call per processed line, with the exact percentage computed at that point.
