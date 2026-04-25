## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Task.Run Wraps Naturally Async Method
// ------------------------------------------------------------------------

public class DocumentIndexer
{
    private readonly IElasticClient _elastic;
    private readonly ILogger<DocumentIndexer> _logger;

    public DocumentIndexer(IElasticClient elastic, ILogger<DocumentIndexer> logger)
    {
        _elastic = elastic;
        _logger = logger;
    }

    // CHANGE 1: Removed Task.Run wrapper entirely; the method is already async and the elastic call is I/O-bound, so no thread pool thread is needed to run it.
    public async Task IndexDocumentAsync(Document doc, CancellationToken cancellationToken)
    {
        _logger.LogDebug("Indexing document {Id}", doc.Id);

        // CHANGE 2: cancellationToken is now passed only to the actual I/O call, not to Task.Run, so cancellation is handled by the operation that can respond to it.
        var response = await _elastic.IndexDocumentAsync(doc, cancellationToken);

        if (!response.IsValid)
        {
            throw new InvalidOperationException(
                $"Failed to index document {doc.Id}: {response.DebugInformation}");
        }

        _logger.LogInformation("Indexed document {Id}", doc.Id);
    }
}
```

## Explanation

### Issue 1: Unnecessary `Task.Run` Around Async I/O

**Problem:** Under sustained load, `ThreadPool.GetAvailableThreads` shows exhaustion and response times climb. The profiler reveals threads blocked waiting on I/O inside thread pool threads. The application is not CPU-bound — it is wasting threads.

**Fix:** Remove the `Task.Run(async () => { ... })` wrapper entirely. The body of `IndexDocumentAsync` becomes the direct implementation of the method, as seen in the reference solution starting at `CHANGE 1`.

**Explanation:** `Task.Run` pulls a thread pool thread to execute its delegate. When the delegate is an `async` lambda, that thread runs only until the first `await`, at which point it is released — but `Task.Run` has already paid the cost of dequeuing a thread. Because `_elastic.IndexDocumentAsync` is an I/O-bound library method that returns a `Task` immediately and drives completion via async I/O callbacks, there is no CPU work to offload. Every call to `IndexDocumentAsync` therefore borrows a thread pool thread for a few microseconds of synchronous preamble, and under high concurrency those borrows pile up faster than threads return, starving the pool. Calling the async method directly skips the `Task.Run` scheduling overhead entirely: the `await` inside the method suspends without holding any thread, and the continuation is posted back when the I/O finishes. A related pitfall is using `Task.Run` to avoid `async`/`await` on a synchronous call path (e.g., to keep a constructor or event handler non-blocking) — that is one of the few legitimate uses, but it does not apply here.

---

### Issue 2: `CancellationToken` Passed to `Task.Run` Instead of the I/O Operation

**Problem:** When `Task.Run(async () => { ... }, cancellationToken)` is used, the token controls whether the queued work item is started at all. If the token is already cancelled before the lambda begins, `Task.Run` throws `OperationCanceledException` as expected. But if the token is cancelled after the lambda starts executing, `Task.Run`'s own cancellation logic does nothing — cancellation of the in-flight `_elastic.IndexDocumentAsync` call depends entirely on passing the token to that method, which the lambda does do. The bug is subtle: the token is doing double duty, and its role with `Task.Run` gives a false sense of coverage while potentially causing `TaskCanceledException` from the wrong source at the wrong time if the scheduling layer and the I/O layer disagree.

**Fix:** After removing `Task.Run`, the token is passed solely to `_elastic.IndexDocumentAsync(doc, cancellationToken)` at `CHANGE 2`. This is the only site that can act on a cancellation request during the I/O operation.

**Explanation:** `Task.Run` accepts a `CancellationToken` for one purpose: if the token is signalled before the queued delegate is dequeued from the thread pool, the task transitions directly to the `Cancelled` state without running the delegate. Once the delegate has started, `Task.Run` ignores the token completely. So in the original code, cancellation after the lambda begins is handled by `_elastic.IndexDocumentAsync` receiving the token — the `Task.Run` token is redundant from that point on. Removing `Task.Run` removes the ambiguity: there is exactly one cancellation-aware call site, and it is the I/O operation itself. A common mistake in similar code is omitting the token from the inner async call and relying on `Task.Run`'s token argument — that pattern silently ignores cancellation for any in-progress I/O.
