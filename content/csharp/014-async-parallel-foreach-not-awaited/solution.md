## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Parallel Async Lambdas Not Awaited
// ------------------------------------------------------------------------

public class EmailDispatchJob
{
    private readonly IEmailService _email;
    private readonly ILogger<EmailDispatchJob> _logger;

    public EmailDispatchJob(IEmailService email, ILogger<EmailDispatchJob> logger)
    {
        _email = email;
        _logger = logger;
    }

    public async Task DispatchBatchAsync(
        IReadOnlyList<Recipient> recipients,
        CancellationToken ct)
    {
        // CHANGE 1 & 2: Replace Parallel.ForEach (which cannot await async lambdas and silently drops Tasks) with Parallel.ForEachAsync, which properly awaits each async body and propagates exceptions back to the caller.
        // CHANGE 3: Pass ParallelOptions with a MaxDegreeOfParallelism cap so we don't open hundreds of concurrent connections at once.
        var parallelOptions = new ParallelOptions
        {
            MaxDegreeOfParallelism = 20, // CHANGE 3: cap concurrency to avoid socket/thread exhaustion
            CancellationToken = ct
        };

        await Parallel.ForEachAsync(recipients, parallelOptions, async (recipient, innerCt) =>
        {
            await _email.SendAsync(recipient.Address, recipient.Name, innerCt);
            _logger.LogInformation("Email sent to {Address}", recipient.Address);
        });

        _logger.LogInformation("Batch of {Count} dispatched.", recipients.Count);
    }
}
```

## Explanation

### Issue 1: Async lambda Tasks silently dropped

**Problem:** The method returns almost immediately regardless of batch size, and many emails are never sent. The hosted service marks the batch as done while most `SendAsync` calls are still in-flight or have not started.

**Fix:** Replace `Parallel.ForEach` with `await Parallel.ForEachAsync` at the CHANGE 1 site. `Parallel.ForEachAsync` accepts an `async` body, awaits each returned `Task`, and only completes when all items have been processed.

**Explanation:** `Parallel.ForEach` expects an `Action<T>` delegate. When you pass an `async` lambda, the compiler matches it to `Action<T>` by wrapping it as `async void` internally — or at best treating the returned `Task` as an ignored object. Either way, `Parallel.ForEach` fires every iteration synchronously and returns without waiting for any of the resulting tasks. `Parallel.ForEachAsync` was introduced in .NET 6 precisely to solve this: its delegate signature is `Func<T, CancellationToken, ValueTask>`, so the runtime can schedule and await each item correctly before the method returns.

---

### Issue 2: Unobserved exceptions crash the process

**Problem:** When `SendAsync` throws (e.g. a transient network error), the exception lands in a `Task` that nothing observes. The GC eventually finalizes the task, the runtime raises `TaskScheduler.UnobservedTaskException`, and with default .NET 6+ behavior the process terminates.

**Fix:** The same CHANGE 1 & 2 swap to `Parallel.ForEachAsync` fixes this: exceptions thrown inside the async body are collected and re-thrown as an `AggregateException` on the awaited call, so the caller sees them and can handle or log them.

**Explanation:** An `async void` or fire-and-forget `Task` has no awaiter to receive its exception. When the task transitions to the faulted state and is garbage-collected without being observed, the runtime fires `TaskScheduler.UnobservedTaskException`. Under load, many concurrent failures can pile up and trigger this event in quick succession. With `Parallel.ForEachAsync`, every inner exception is captured and wrapped, so the `await` at the call site either propagates it normally or lets a try/catch handle it, keeping the process stable.

---

### Issue 3: Unbounded concurrency exhausts resources

**Problem:** Even after fixing the awaiting problem, launching 1 000 concurrent HTTP or SMTP connections simultaneously saturates the connection pool, exhausts ephemeral ports, and can make all requests fail or timeout together.

**Fix:** At the CHANGE 3 site, a `ParallelOptions` object is created with `MaxDegreeOfParallelism = 20` and passed to `Parallel.ForEachAsync`, capping how many emails are in-flight at any one time.

**Explanation:** Without a cap, `Parallel.ForEachAsync` will try to run as many iterations concurrently as the scheduler allows, which on a machine with enough thread-pool threads can be hundreds. Each concurrent `SendAsync` typically opens a connection. Most HTTP clients (including `HttpClient` via `IHttpClientFactory`) have a default connection limit per host, so excess tasks queue inside the client, holding threads and memory. Setting `MaxDegreeOfParallelism` to a modest value like 20 lets you tune throughput without overloading the remote mail server or local socket resources. A good default is 10–50 for outbound I/O; profile your specific mail provider's rate limits to dial it in.
