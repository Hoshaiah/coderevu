## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Passed CancellationToken is never observed, causing slow shutdown and wasted work
// ------------------------------------------------------------------------
public class QueueProcessor : BackgroundService
{
    private readonly IMessageQueue _queue;
    private readonly IRecordStore _store;

    public QueueProcessor(IMessageQueue queue, IRecordStore store)
    {
        _queue = queue;
        _store = store;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // CHANGE 1: replaced `while (true)` with `while (!stoppingToken.IsCancellationRequested)` so the loop exits promptly when the host signals shutdown.
        while (!stoppingToken.IsCancellationRequested)
        {
            // CHANGE 3: pass stoppingToken so the dequeue I/O can be cancelled on shutdown.
            var messages = await _queue.DequeueBatchAsync(batchSize: 50, cancellationToken: stoppingToken);
            if (messages.Count == 0)
            {
                // CHANGE 2: pass stoppingToken to Task.Delay so the idle wait is interrupted immediately when shutdown is requested instead of blocking for the full 2 seconds.
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
                continue;
            }

            foreach (var msg in messages)
            {
                // CHANGE 1 (guard): check token inside the batch loop so a shutdown
                // signal stops processing mid-batch rather than finishing all 50 items.
                if (stoppingToken.IsCancellationRequested)
                    break;

                var record = Transform(msg);
                // CHANGE 3: pass stoppingToken so the save I/O can be cancelled on shutdown.
                await _store.SaveAsync(record, stoppingToken);
            }

            // Only acknowledge messages if we were not cancelled mid-batch,
            // avoiding a partial acknowledgement of unprocessed records.
            if (!stoppingToken.IsCancellationRequested)
                await _queue.AcknowledgeBatchAsync(messages);
        }
    }

    private Record Transform(Message msg) => new Record(msg.Body);
}
```

## Explanation

### Issue 1: Loop never checks cancellation token

**Problem:** The `while (true)` loop runs forever regardless of what the host signals. When the application is stopped, `BackgroundService` sets `stoppingToken` to cancelled, but the loop keeps iterating. The host waits up to 5 seconds, then kills the process mid-batch.

**Fix:** Replace `while (true)` with `while (!stoppingToken.IsCancellationRequested)`, and add a matching `if (stoppingToken.IsCancellationRequested) break;` inside the `foreach` so the check also fires mid-batch rather than only at the top of the outer loop.

**Explanation:** `BackgroundService` passes a `CancellationToken` that the host triggers when it begins shutting down. Unless the code actually reads `IsCancellationRequested` (or `await`s something that observes the token), the signal is silently ignored. The outer `while` check catches the common case where the loop is between batches. The inner `break` catches the case where a large batch is being processed item-by-item — without it, all 50 items still run to completion before the loop condition is ever re-evaluated. A related pitfall: if `stoppingToken` is cancelled while `SaveAsync` is awaited and that method also ignores the token, the inner guard still won't help — which is why issue 3 matters independently.

---

### Issue 2: Task.Delay blocks shutdown for up to 2 seconds

**Problem:** When the queue is empty the code calls `await Task.Delay(TimeSpan.FromSeconds(2))` without a cancellation token. Even after the outer loop condition is fixed, this delay holds the `ExecuteAsync` task alive for up to 2 seconds during shutdown, eating into the 5-second grace period and slowing final teardown.

**Fix:** Replace `Task.Delay(TimeSpan.FromSeconds(2))` with `Task.Delay(TimeSpan.FromSeconds(2), stoppingToken)` so the delay is cancelled immediately when the host requests shutdown.

**Explanation:** `Task.Delay` has an overload that accepts a `CancellationToken`. When the token is cancelled, the delay task transitions to a cancelled state and the `await` unblocks right away. Without this, the thread sleeps for the full duration — in the worst case, if a shutdown arrives just after the delay starts, the service wastes nearly 2 of the available 5 seconds doing nothing. Note that `await`ing a cancelled `Task.Delay` throws `OperationCanceledException`; `BackgroundService` catches this and treats it as normal shutdown, so no additional try/catch is needed here.

---

### Issue 3: I/O calls do not propagate the cancellation token

**Problem:** `_queue.DequeueBatchAsync` and `_store.SaveAsync` are called without passing `stoppingToken`. If those methods support cancellation internally (network calls, database commands), they will not be interrupted on shutdown. The process runs wasted I/O work, holds open connections, and risks leaving a record half-written if the host eventually force-kills.

**Fix:** Add `cancellationToken: stoppingToken` to the `DequeueBatchAsync` call and add `stoppingToken` as a parameter to `SaveAsync`, matching the overloads that accept a `CancellationToken`.

**Explanation:** Most async I/O libraries (HttpClient, EF Core, Azure SDK, etc.) accept a `CancellationToken` and wire it into the underlying socket or database command. Passing the token lets the library abort the in-flight operation as soon as cancellation is requested, freeing the connection and returning control to the caller quickly. Without it, the I/O runs to its natural completion or its own timeout, which could be many seconds. A concrete risk: if `SaveAsync` takes 3 seconds per record and is called without a token, the service may burn the entire 5-second grace window on a single save, then get killed before `AcknowledgeBatchAsync` runs, causing that message to be redelivered and processed twice.
