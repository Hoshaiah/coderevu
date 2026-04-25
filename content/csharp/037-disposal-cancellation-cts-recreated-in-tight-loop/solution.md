## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationTokenSource Leaked in Polling Loop
// ------------------------------------------------------------------------

public class HealthCheckPoller : BackgroundService
{
    private readonly IHealthCheckService _healthCheck;
    private readonly IMetricsSink _metrics;

    public HealthCheckPoller(IHealthCheckService healthCheck, IMetricsSink metrics)
    {
        _healthCheck = healthCheck;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // CHANGE 1: Wrap CTS in a using statement so it is disposed at the end of every iteration, releasing the internal Timer created by CancelAfter.
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            try
            {
                var result = await _healthCheck.CheckAsync(cts.Token);
                _metrics.Record(result);
            }
            catch (OperationCanceledException) { /* timeout or shutdown */ }

            // CHANGE 2: Wrap the delay in try/catch so a shutdown-triggered OperationCanceledException exits the loop cleanly rather than propagating as an unhandled exception after the CTS is disposed.
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
            catch (OperationCanceledException) { /* service is stopping */ }
        }
    }
}
```

## Explanation

### Issue 1: CancellationTokenSource Never Disposed

**Problem:** Every 10 seconds the poller creates a new `CancellationTokenSource` via `CreateLinkedTokenSource` and then calls `CancelAfter` on it. Neither the CTS nor its internal `Timer` is ever released. Over time tens of thousands of live `CancellationTokenSource` and `Timer` objects accumulate on the heap, producing the steady ~5 MB/hour growth operators observed.

**Fix:** Add `using` to the `var cts` declaration (`using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken)`). This causes `Dispose()` to be called automatically at the end of each loop iteration, which cancels and releases the internal `Timer`.

**Explanation:** `CancelAfter` schedules a `System.Threading.Timer` inside the CTS to fire after the specified delay. That timer holds a reference back to the CTS, so neither object is eligible for garbage collection even after the poll completes — the GC sees them as reachable through the timer queue. Because the loop runs every 10 seconds and never disposes anything, the live set grows without bound. Calling `Dispose()` tells the runtime to cancel the pending timer callback and drop all internal references, making both objects immediately collectable. The `using var` form is the idiomatic way to ensure this happens even when an exception is thrown inside the loop body.

---

### Issue 2: Task.Delay Cancellation Exception Not Caught

**Problem:** When the host signals shutdown, `stoppingToken` is cancelled while `Task.Delay` is awaited. `Task.Delay` then throws `OperationCanceledException`, which is not caught. This exception propagates out of `ExecuteAsync`, which the `BackgroundService` infrastructure treats as an unexpected fault rather than a clean stop.

**Fix:** Wrap `await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken)` in its own `try/catch (OperationCanceledException)` block. The `while` condition already checks `stoppingToken.IsCancellationRequested`, so the loop exits normally on the next iteration check without needing to rethrow.

**Explanation:** `Task.Delay` with a `CancellationToken` throws `OperationCanceledException` the moment that token is cancelled — it does not simply return early. Without a catch, the exception escapes `ExecuteAsync`. `BackgroundService` logs this as an error and, depending on the host configuration, may crash the process. The `while (!stoppingToken.IsCancellationRequested)` guard already provides the exit condition, so catching and discarding the exception here is correct: the loop will re-evaluate its condition and terminate cleanly. A related pitfall is catching `OperationCanceledException` too broadly in the health-check block, which could accidentally suppress a legitimate shutdown; keeping the two catch sites separate makes the intent explicit.
