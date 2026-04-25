## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationTokenSource Leak in Loop
// ------------------------------------------------------------------------

public class SensorPoller : BackgroundService
{
    private readonly IReadOnlyList<string> _sensorUrls;
    private readonly HttpClient _http;
    private readonly ILogger<SensorPoller> _log;

    public SensorPoller(IReadOnlyList<string> sensorUrls, HttpClient http, ILogger<SensorPoller> log)
    {
        _sensorUrls = sensorUrls;
        _http = http;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            foreach (var url in _sensorUrls)
            {
                // CHANGE 2: bail out of the sensor loop immediately when the host signals shutdown, preventing unnecessary requests after cancellation.
                if (stoppingToken.IsCancellationRequested)
                    break;

                // CHANGE 1: wrap cts in a using statement so Dispose is guaranteed after each poll, releasing the OS wait handle and the stoppingToken callback registration.
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                cts.CancelAfter(TimeSpan.FromSeconds(3));

                try
                {
                    var reading = await _http.GetFromJsonAsync<SensorReading>(url, cts.Token);
                    _log.LogInformation("Sensor {Url}: {Value}", url, reading?.Value);
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Failed to poll {Url}", url);
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}
```

## Explanation

### Issue 1: CancellationTokenSource Never Disposed

**Problem:** The process handle count grows at roughly 1,200 handles per minute (200 sensors × 6 polls per minute) and the process crashes after ~12 hours with `IOException: Not enough storage is available to process this command`. The handles are OS-level wait handles that back each `CancellationTokenSource`.

**Fix:** Add `using` to the `var cts` declaration (`using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);`). This guarantees `cts.Dispose()` is called at the end of each loop iteration, which releases the underlying `WaitHandle` and unregisters the callback registered against `stoppingToken`.

**Explanation:** `CancellationTokenSource.CreateLinkedTokenSource` allocates a `WaitHandle` (an OS semaphore or event) and registers a delegate on the parent token so it can propagate cancellation. Both of these are unmanaged resources tracked by `Dispose`. Without `Dispose`, neither resource is freed until the finalizer runs — but the finalizer thread cannot keep up with 1,200 allocations per minute under normal GC pressure, so the OS handle table fills up. The `using var` pattern ties disposal to the lexical scope of the `foreach` body, so cleanup happens synchronously on every iteration regardless of whether the request succeeds, times out, or throws. A related pitfall: calling `cts.Cancel()` manually does not dispose the source; you still need `Dispose` to release the wait handle even after cancellation.

---

### Issue 2: No Cancellation Check Between Sensor Requests

**Problem:** When the host signals shutdown (e.g., during a rolling deploy or `Ctrl+C`), the service does not stop between individual sensor polls. It completes the entire 200-sensor `foreach` iteration — potentially firing up to 200 more HTTP requests with a 3-second timeout each — before the `while` condition is re-evaluated.

**Fix:** Add `if (stoppingToken.IsCancellationRequested) break;` at the top of the `foreach` body, before the `using var cts` line. This exits the sensor loop on the first opportunity after the host requests shutdown.

**Explanation:** `BackgroundService.ExecuteAsync` receives `stoppingToken`, which the host cancels when `StopAsync` is called (typically with a 5-second default shutdown timeout). The `while` guard checks that token, but only after the full `foreach` finishes. With 200 sensors and a 3-second per-request timeout, the worst-case delay before the loop exits is 600 seconds — far beyond the host's shutdown grace period. The host will then forcibly terminate the process. Checking `stoppingToken.IsCancellationRequested` at the top of each `foreach` iteration means the loop exits within one sensor-poll cycle of the shutdown signal. The `Task.Delay` at the bottom already passes `stoppingToken` and will throw `OperationCanceledException` to unwind cleanly, so no additional change is needed there.
