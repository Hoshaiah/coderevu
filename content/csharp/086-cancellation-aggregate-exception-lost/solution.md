## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — OperationCanceledException Lost in WhenAll
// ------------------------------------------------------------------------

public class BatchUploader
{
    private readonly IStorageClient _storage;
    private readonly ILogger<BatchUploader> _logger;

    public BatchUploader(IStorageClient storage, ILogger<BatchUploader> logger)
    {
        _storage = storage;
        _logger = logger;
    }

    public async Task UploadAllAsync(IReadOnlyList<string> filePaths, CancellationToken cancellationToken)
    {
        try
        {
            // CHANGE 2: Materialize the task list immediately with ToArray() to prevent lazy re-enumeration and ensure all tasks start deterministically before WhenAll observes them.
            var tasks = filePaths.Select(path =>
                _storage.UploadFileAsync(path, cancellationToken)).ToArray();

            // CHANGE 1: Wrap Task.WhenAll in a try/catch that unwraps AggregateException so that a cancellation buried inside a multi-task fault is still routed to the OperationCanceledException handler instead of leaking as AggregateException.
            await Task.WhenAll(tasks).WaitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Upload batch cancelled.");
            throw;
        }
        catch (AggregateException aex) when (aex.InnerExceptions.All(e => e is OperationCanceledException))
        {
            // CHANGE 1 (cont): If every inner exception is a cancellation, treat the whole batch as cancelled so callers see a consistent OperationCanceledException rather than an AggregateException.
            _logger.LogWarning("Upload batch cancelled.");
            throw new OperationCanceledException("Upload batch was cancelled.", aex, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Upload batch failed.");
            throw;
        }
    }
}
```

## Explanation

### Issue 1: AggregateException Swallows OperationCanceledException

**Problem:** When multiple upload tasks fault simultaneously — some with `OperationCanceledException` and some with `IOException` — `Task.WhenAll` packages all of the exceptions into a single `AggregateException`. The `catch (OperationCanceledException)` block only matches when the awaited task's direct exception is an `OperationCanceledException`; it does not match an `AggregateException` wrapper. So the cancellation handler is silently skipped and the `AggregateException` propagates up, sometimes crashing the CLI or leaking into the test harness.

**Fix:** A new `catch (AggregateException aex) when (aex.InnerExceptions.All(e => e is OperationCanceledException))` block is added between the existing two catch clauses. When every inner exception is a cancellation, the code logs the warning and throws a fresh `OperationCanceledException` wrapping the aggregate, so callers see a consistent exception type.

**Explanation:** `Task.WhenAll` always stores all faulted task exceptions and, when awaited, re-throws them as an `AggregateException` if more than one task faulted. The C# `await` unwrapper only peels off the first inner exception when there is exactly one task fault; with multiple faults the raw `AggregateException` escapes instead. The `when` clause on the new catch block acts as a filter: mixed failures (some `IOException`, some `OperationCanceledException`) fall through to the generic `Exception` handler so callers still get a meaningful error, while pure-cancellation batches are routed correctly. A related pitfall: catching `AggregateException` without inspecting inner exceptions can accidentally silence real upload errors, which is why the `All(e => e is OperationCanceledException)` guard is necessary.

---

### Issue 2: Lazy LINQ Enumeration Delays Task Creation

**Problem:** The `Select` call returns an `IEnumerable<Task>` that is not evaluated until `Task.WhenAll` iterates it internally. This means upload tasks do not start until `WhenAll` begins consuming the sequence, and if anything re-enumerates the same `IEnumerable` (e.g., in a test that inspects the task list, or if the code is refactored), each enumeration spawns a new set of tasks.

**Fix:** `.ToArray()` is appended to the `Select` call so all tasks are created and started before `Task.WhenAll` is called.

**Explanation:** `IStorageClient.UploadFileAsync` is called for each element as the enumerator advances. Without `ToArray()`, task creation is deferred to the moment `Task.WhenAll` iterates the sequence, which is usually fine but produces non-deterministic startup ordering and is fragile under refactoring. If the `IEnumerable` were ever passed to two consumers or enumerated twice, each element would trigger a second upload call. Materializing to an array makes the task list a concrete snapshot: all uploads are in-flight before `WhenAll` begins watching them, which also makes logging and debugging easier because `tasks.Length` is immediately available.
