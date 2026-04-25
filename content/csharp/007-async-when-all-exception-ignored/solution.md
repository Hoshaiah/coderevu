## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — WhenAll Partial Failure Silently Dropped
// ------------------------------------------------------------------------

public class NotificationDispatcher
{
    private readonly ILogger<NotificationDispatcher> _logger;
    private readonly IReadOnlyList<INotificationProvider> _providers;

    public NotificationDispatcher(
        ILogger<NotificationDispatcher> logger,
        IReadOnlyList<INotificationProvider> providers)
    {
        _logger = logger;
        _providers = providers;
    }

    public async Task DispatchAsync(Notification notification, CancellationToken ct)
    {
        // CHANGE 1: Wrap each provider call so that a synchronous throw inside SendAsync is captured as a faulted Task rather than escaping the Select/ToList materialisation step, where it would never reach the catch block.
        var tasks = _providers
            .Select(p => Task.Run(() => p.SendAsync(notification, ct), ct))
            .ToList();

        // CHANGE 2: Await the WhenAll result and inspect all tasks individually so that every provider failure is logged, not just the first exception unwrapped by the default AggregateException behaviour.
        var whenAll = Task.WhenAll(tasks);
        try
        {
            await whenAll;
        }
        catch
        {
            // whenAll.Exception is the AggregateException containing all inner exceptions.
            var aggregate = whenAll.Exception;
            if (aggregate != null)
            {
                foreach (var inner in aggregate.InnerExceptions)
                {
                    _logger.LogError(inner, "A provider failed to dispatch notification {Id}.", notification.Id);
                }
            }

            // CHANGE 3: Throw before reaching the success log so that 'dispatched successfully' is never printed when one or more providers faulted.
            throw;
        }

        _logger.LogInformation("Notification {Id} dispatched successfully.", notification.Id);
    }
}
```

## Explanation

### Issue 1: Synchronous provider exception escapes task materialisation

**Problem:** If any `INotificationProvider.SendAsync` throws synchronously (before its first `await`) during the `.Select(...).ToList()` step, the exception propagates directly out of `ToList` as a plain exception — it is never wrapped in a `Task`. This means `Task.WhenAll` never sees it, the `catch` block never fires, and the "dispatched successfully" log prints.

**Fix:** Each provider call is wrapped with `Task.Run(() => p.SendAsync(...), ct)`. This captures any synchronous throw from `SendAsync` inside the returned `Task`, so the fault surfaces through `WhenAll` and reaches the `catch` block reliably.

**Explanation:** `Select` is lazy, but `.ToList()` forces evaluation immediately on the calling thread. Any exception thrown before the first `await` inside an `async` method does get wrapped in the returned `Task` under normal `async Task` semantics, but a non-`async` method or a synchronous throw in the first synchronous segment before any `await` can escape that wrapping when called directly. `Task.Run` guarantees the call happens on a thread-pool thread and the returned `Task` captures all exceptions regardless of where they originate. A related pitfall: if you later change a provider to be synchronous for testing, the bug silently reappears without `Task.Run`.

---

### Issue 2: AggregateException inner exceptions not individually logged

**Problem:** `await Task.WhenAll(tasks)` unwraps the `AggregateException` and re-throws only its first inner exception. If three providers fail, the original code logs only one `Exception` — the SMS gateway failure obscures Firebase and APNS failures that may have occurred in the same batch.

**Fix:** The awaited call is split: `Task.WhenAll` is stored in `whenAll`, then `await whenAll` is placed inside `try/catch`. On failure, `whenAll.Exception` (the full `AggregateException`) is enumerated and each `InnerException` is logged separately with `_logger.LogError`.

**Explanation:** When you `await` a faulted `Task`, the runtime re-throws the first `InnerException` of the `AggregateException`, not the aggregate itself. This is by design to make `await` feel like synchronous code. However, `Task.WhenAll` can collect faults from multiple concurrent tasks. To see all of them you must read `.Exception.InnerExceptions` on the original `Task` object before or after the `await` throws. Storing the task in a variable before awaiting it lets you access `.Exception` in the `catch` block.

---

### Issue 3: Success log fires unconditionally on partial failure

**Problem:** Operators see "Notification {Id} dispatched successfully" in logs even during the 5% of batches where the SMS gateway throws. This masks the failure entirely — no alerting fires and on-call engineers have no signal to investigate.

**Fix:** The `throw` statement in the new `catch` block (CHANGE 3) re-throws the caught exception before execution can reach `_logger.LogInformation("dispatched successfully")`. The success log now only prints when every provider's `Task` completed without fault.

**Explanation:** In the original code, the single `catch (Exception ex)` block was intended to catch `WhenAll` failures, but because the exception escaped during task materialisation (Issue 1) rather than during `await`, control never entered that block. The code fell through to `LogInformation` every time. Even if Issue 1 were absent, the catch-log-rethrow pattern in the original code does log the error, but execution still reaches the success log because `throw` inside a `catch` exits the method — the success log is after the `catch`, inside the same `try` block, so it would not run. The real trap here is that without Issue 1 being fixed first, the catch never fires at all, and the success log is the only log entry produced.
