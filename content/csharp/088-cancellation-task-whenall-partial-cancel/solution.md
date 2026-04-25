## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — WhenAll Swallows Cancellation Exception
// ------------------------------------------------------------------------

public async Task<RefreshResult[]> RefreshAllAsync(
    IReadOnlyList<string> serviceNames,
    CancellationToken cancellationToken)
{
    var tasks = serviceNames
        .Select(name => RefreshAsync(name, cancellationToken))
        .ToList();

    try
    {
        return await Task.WhenAll(tasks);
    }
    // CHANGE 1: Re-throw OperationCanceledException instead of swallowing it so cancellation propagates correctly to the caller and the async chain unwinds as expected.
    catch (OperationCanceledException)
    {
        throw;
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Refresh failed");
        throw;
    }
}
```

## Explanation

### Issue 1: Cancellation Exception Swallowed, Not Re-Thrown

**Problem:** When the `CancellationToken` is signalled, `Task.WhenAll` throws `OperationCanceledException`. The `catch (OperationCanceledException)` block catches it and returns partial results instead of re-throwing. The caller receives a normal return value and has no way to know the operation was cancelled. The API layer therefore cannot propagate cancellation to the HTTP response.

**Fix:** Replace the body of the `catch (OperationCanceledException)` block with a plain `throw;`. This lets the exception propagate up the call stack unchanged, preserving the original exception and its `CancellationToken` context.

**Explanation:** `Task.WhenAll` aggregates all faulted tasks, but when one or more tasks throw `OperationCanceledException` it surfaces as a single `OperationCanceledException` (or wraps them in an `AggregateException` depending on how it is awaited). By catching and not re-throwing, the method treats cancellation as a normal completion path. The awaiting code in the API endpoint never sees an exception, so it sends a 200 response with partial data rather than surfacing a 499/cancellation. Even though the individual `RefreshAsync` calls do stop early when the token fires, the orchestrator method disguises that fact from every layer above it. The fix is to let the exception travel up naturally — `throw;` preserves the original stack trace and exception identity, which matters for structured logging and middleware that inspects `HttpContext.RequestAborted`.

---

### Issue 2: Partial Results Returned on Cancellation, Masking Incomplete State

**Problem:** The original catch block collects results from tasks that completed successfully before cancellation and returns them as if the full refresh succeeded. The caller has no signal that the result set is incomplete, which can lead to stale or partial data being persisted or served downstream.

**Fix:** The entire body of the `catch (OperationCanceledException)` block is replaced with `throw;`, removing the partial-result collection logic (`tasks.Where(t => t.IsCompletedSuccessfully)...`). No partial array is returned.

**Explanation:** When a batch operation is cancelled mid-flight, returning the completed subset implies the caller asked for partial results — but `RefreshAllAsync` has no such contract. Code that calls this method likely expects either a full `RefreshResult[]` or an exception; receiving a short array silently is a third, undocumented outcome. Any downstream logic that iterates the result and assumes it covers all `serviceNames` will silently skip services that had not yet refreshed. Removing the partial-result path means callers must handle `OperationCanceledException` explicitly if they want to do something with whatever did complete, which is the correct design boundary.
