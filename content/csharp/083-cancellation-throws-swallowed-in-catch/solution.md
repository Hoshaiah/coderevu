## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — OperationCanceledException Swallowed in Catch
// ------------------------------------------------------------------------

public class DataSyncWorker : BackgroundService
{
    private readonly IApiClient _api;
    private readonly IDataRepository _repo;
    private readonly ILogger<DataSyncWorker> _logger;

    public DataSyncWorker(IApiClient api, IDataRepository repo, ILogger<DataSyncWorker> logger)
    {
        _api = api;
        _repo = repo;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var page = 0;
                List<Record> batch;
                do
                {
                    batch = await _api.GetPageAsync(page++, stoppingToken);
                    await _repo.UpsertBatchAsync(batch, stoppingToken);
                } while (batch.Count > 0);

                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            // CHANGE 1: Catch OperationCanceledException before the general Exception handler so cancellation propagates and exits the loop instead of being swallowed and retried.
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Sync error, retrying after delay");
                // CHANGE 2: Pass stoppingToken to Task.Delay so the retry sleep is interrupted immediately when the host signals shutdown, rather than blocking for the full 5 seconds.
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }
}
```

## Explanation

### Issue 1: `OperationCanceledException` Swallowed by Broad Catch

**Problem:** When `stoppingToken` is cancelled (e.g., on deployment shutdown), the awaited calls inside the `do/while` loop throw `OperationCanceledException`. The `catch (Exception ex)` block catches it, logs it as a sync error, and loops again. The `while (!stoppingToken.IsCancellationRequested)` guard is never reached because the exception is eaten before control returns to it. The worker keeps running until the hard kill timeout.

**Fix:** A dedicated `catch (OperationCanceledException)` block is added above the `catch (Exception ex)` block. It immediately re-throws with `throw;`, allowing the exception to propagate out of `ExecuteAsync` and signal a clean shutdown.

**Explanation:** C# evaluates `catch` blocks top-to-bottom and stops at the first match. `OperationCanceledException` is a subclass of `Exception`, so without a more-specific handler listed first, the broad handler always wins. Re-throwing with `throw;` (not `throw ex;`) preserves the original stack trace. `BackgroundService.ExecuteAsync` is designed to exit either by returning normally or by letting an `OperationCanceledException` propagate when the stopping token fires — catching it breaks that contract. A related pitfall: `TaskCanceledException` is itself a subclass of `OperationCanceledException`, so the single specific handler covers both.

---

### Issue 2: Retry Delay Ignores Cancellation Token

**Problem:** Even after fixing issue 1, if a transient API error occurs right before shutdown, the catch block calls `Task.Delay(TimeSpan.FromSeconds(5))` without a cancellation token. The worker blocks for the full 5 seconds regardless of whether the host has signalled it to stop, adding unnecessary delay to shutdown.

**Fix:** `stoppingToken` is passed as the second argument to `Task.Delay` in the catch block: `await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken)`. The `OperationCanceledException` that `Task.Delay` then throws on cancellation is re-thrown by the specific handler added in Change 1.

**Explanation:** `Task.Delay` has an overload that accepts a `CancellationToken`. When the token is cancelled mid-sleep, `Task.Delay` throws `OperationCanceledException` immediately instead of waiting out the full duration. Without the token, the delay is a blocking sleep from the perspective of the cancellation system — the worker cannot respond to shutdown until the sleep completes. Passing `stoppingToken` here means the worst-case extra shutdown latency drops from 5 seconds to near-zero.
