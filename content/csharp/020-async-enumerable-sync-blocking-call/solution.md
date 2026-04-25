## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Sync Block Inside IAsyncEnumerable
// ------------------------------------------------------------------------

public async IAsyncEnumerable<DomainEvent> ReadAsync(
    [EnumeratorCancellation] CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        // CHANGE 1: Pass ct to Task.Run so the queued work item is cancelled when the caller cancels, and use ConfigureAwait(false) to avoid capturing a sync context; the real fix is that Consume must run on a dedicated thread (see below) rather than re-borrowing a pool thread each iteration.
        // CHANGE 2: Pass ct into Task.Run so that if cancellation is requested the work item is never started (and Consume's short timeout means it exits quickly on the next iteration).
        ConsumeResult<Ignore, string>? result = await Task.Run(
            () => ct.IsCancellationRequested ? null : _consumer.Consume(TimeSpan.FromSeconds(1)),
            ct).ConfigureAwait(false);

        if (result?.Message?.Value is null)
            continue;

        DomainEvent evt;
        try
        {
            evt = JsonSerializer.Deserialize<DomainEvent>(result.Message.Value)!;
        }
        catch (JsonException)
        {
            continue;
        }

        yield return evt;
    }
}
```

## Explanation

### Issue 1: Task.Run Still Blocks a Thread Pool Thread

**Problem:** Every loop iteration `await Task.Run(...)` parks a thread pool thread inside `_consumer.Consume` for up to one second. With N concurrent readers, N pool threads are always blocked waiting. ASP.NET Core's thread pool has a limited number of threads; once they are all parked in `Consume`, new requests queue indefinitely and latency spikes to tens of seconds.

**Fix:** At CHANGE 1 the lambda now checks `ct.IsCancellationRequested` before calling `Consume` so a cancellation check short-circuits immediately. The `ConfigureAwait(false)` removes the captured synchronization context so resumption does not marshal back to the ASP.NET Core request context, reducing context-switch cost. For a production fix the blocking call should run on a single dedicated background thread (e.g. a `Channel<T>` fed by one `Thread`) so the thread pool is never involved; but within the constraint of keeping changes minimal this makes the existing pattern safer.

**Explanation:** `Task.Run` does not make a blocking call non-blocking — it only moves the block from the calling thread to a pool thread. When `await` suspends the iterator, the underlying state machine is later resumed on another pool thread, which then immediately blocks again in `Consume`. The number of pool threads blocked equals the number of active readers. The thread pool's hill-climbing algorithm does slowly add threads over time, but it adds at most one every ~500 ms, far slower than new connections arrive under load. The only real escape is to ensure at most one thread blocks in `Consume` regardless of how many consumers exist, typically by using a `Channel<T>` filled by one producer thread and read with `await channel.Reader.ReadAsync(ct)`, which is a genuine async wait.

---

### Issue 2: CancellationToken Not Forwarded to Task.Run

**Problem:** The original code ignores `ct` inside `Task.Run`, so when the HTTP client disconnects and ASP.NET Core signals cancellation, the in-flight `Consume` call runs to completion (up to one second) before the iterator can check `ct.IsCancellationRequested`. During that window the thread remains allocated and the iterator does not exit promptly.

**Fix:** At CHANGE 2 `ct` is passed as the second argument to `Task.Run`. This causes the TPL to throw `OperationCanceledException` immediately if the token is already cancelled before the work item is dequeued, and the inner lambda checks `ct.IsCancellationRequested` so it skips `Consume` if cancellation has been requested.

**Explanation:** `Task.Run(action)` and `Task.Run(action, ct)` look similar but behave differently on cancellation. Without `ct`, the task is unconditionally queued and runs to completion. With `ct`, if the token is cancelled before the task starts executing, `Task.Run` returns a cancelled task immediately without ever invoking the lambda. Passing `ct` also lets the TPL correctly propagate `OperationCanceledException` back to the `await` site, which causes `await foreach` to stop iteration cleanly rather than swallowing a silent timeout.
