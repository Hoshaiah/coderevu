## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationException Swallowed in Retry Loop
// ------------------------------------------------------------------------

public async Task ImportBatchAsync(IEnumerable<int> ids, CancellationToken ct)
{
    foreach (var id in ids)
    {
        int attempts = 0;
        while (true)
        {
            try
            {
                var record = await _apiClient.FetchAsync(id, ct);
                await _repository.UpsertAsync(record, ct);
                break;
            }
            // CHANGE 1: Re-throw OperationCanceledException before the generic catch so cancellation is never swallowed by the retry loop and propagates up to the host immediately.
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                attempts++;
                if (attempts >= 3)
                {
                    _logger.LogError(ex, "Giving up on id {Id} after 3 attempts", id);
                    break;
                }
                _logger.LogWarning(ex, "Retrying id {Id}, attempt {N}", id, attempts);
                // CHANGE 2: Pass ct to Task.Delay so the delay itself is also cancelled promptly; the OperationCanceledException it throws will be caught by the CHANGE 1 handler above and re-thrown.
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }
        }
    }
}
```

## Explanation

### Issue 1: Cancellation swallowed by bare catch

**Problem:** When the host signals shutdown, `FetchAsync` or `UpsertAsync` throws `OperationCanceledException`. The bare `catch (Exception ex)` catches it, logs a warning, increments the attempt counter, and loops again. The loop keeps running through all retry attempts for every remaining ID, which is why operators see the host hang for 30+ seconds.

**Fix:** A `catch (OperationCanceledException)` block is added immediately before the generic `catch (Exception ex)` block. It contains only `throw;`, letting the exception propagate up through `ImportBatchAsync` to the hosted service, which then reports completion to the host.

**Explanation:** In C#, `OperationCanceledException` (and its subclass `TaskCanceledException`) derives from `Exception`, so a plain `catch (Exception ex)` catches it just like any transient I/O error. The retry logic has no way to distinguish "network blip" from "process is shutting down". By placing a more specific `catch (OperationCanceledException)` first, the runtime matches it before reaching the generic handler. `throw;` preserves the original stack trace. A related pitfall: if you check `ct.IsCancellationRequested` inside the generic handler instead of using a separate catch, you still log a spurious warning before re-throwing; the dedicated catch block is cleaner and ensures no warning is emitted for an expected shutdown.

---

### Issue 2: Task.Delay blocks shutdown when cancellation arrives between retries

**Problem:** Even if the cancellation exception from `FetchAsync` were handled correctly, the two-second `Task.Delay` between retries runs to completion before the next iteration can observe cancellation. If cancellation arrives just after the delay starts, the loop sits idle for up to two seconds per retry per ID before it can check the token again.

**Fix:** `Task.Delay(TimeSpan.FromSeconds(2), ct)` already receives `ct` in the buggy code, so the delay itself will throw `OperationCanceledException` when the token fires. With CHANGE 1 in place, that exception is now re-thrown immediately instead of being swallowed, so the delay is aborted as soon as the token is cancelled.

**Explanation:** `Task.Delay` with a `CancellationToken` cancels the timer and throws `OperationCanceledException` the moment the token is signalled, rather than waiting for the full duration. Before CHANGE 1, that exception fell into the generic `catch (Exception ex)` block, was logged as a warning, and the loop incremented the attempt counter and tried again — meaning the cancellation signal produced up to three extra retries instead of an immediate exit. After CHANGE 1, the `catch (OperationCanceledException)` handler intercepts it first and re-throws, so the delay and the fetch/upsert calls both exit promptly on cancellation.
