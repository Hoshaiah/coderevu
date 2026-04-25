## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationToken Registration Never Removed
// ------------------------------------------------------------------------

public class KafkaConsumerLoop : BackgroundService
{
    private readonly IConsumer<string, string> _consumer;
    private readonly IMessageHandler _handler;

    public KafkaConsumerLoop(
        IConsumer<string, string> consumer,
        IMessageHandler handler)
    {
        _consumer = consumer;
        _handler = handler;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _consumer.Subscribe("orders");

        while (!stoppingToken.IsCancellationRequested)
        {
            var result = _consumer.Consume(TimeSpan.FromMilliseconds(100));
            if (result is null) continue;

            // CHANGE 1: Use CreateLinkedTokenSource instead of manually calling stoppingToken.Register — the linked CTS is disposed via `using`, which also removes the internal registration from stoppingToken automatically, preventing the leak.
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);

            await _handler.HandleAsync(result.Message, cts.Token);
        }

        _consumer.Close();
    }
}
```

## Explanation

### Issue 1: Registration on long-lived token never removed

**Problem:** Every time a Kafka message arrives, `stoppingToken.Register(() => cts.Cancel())` adds a new callback to `stoppingToken`'s internal registration list. That list is owned by `stoppingToken`, which lives for the entire application lifetime. The `CancellationTokenRegistration` and its closure are never removed, so they accumulate — one per message. After millions of messages the heap contains millions of live registrations.

**Fix:** Replace the manual `stoppingToken.Register` call and the bare `new CancellationTokenSource()` with a single `CancellationTokenSource.CreateLinkedTokenSource(stoppingToken)` call (CHANGE 1). The `using` statement disposes the linked CTS at the end of each loop iteration, and `Dispose` automatically deregisters the internal callback from `stoppingToken`.

**Explanation:** `CancellationToken.Register` appends a `CancellationTokenRegistration` to a list inside the token's source. Removing that entry requires calling `Dispose` on the returned `CancellationTokenRegistration`. The buggy code discards the return value of `Register`, so there is no handle to dispose. `CreateLinkedTokenSource` does the same wiring internally, but it tracks the registration itself and removes it when you call `Dispose` on the linked `CancellationTokenSource`. Because the `using var cts` block ends on every loop iteration, each registration is cleaned up immediately after the message is handled. A related pitfall: if you ever do need `Register` directly, always store the returned `CancellationTokenRegistration` in a `using` block or call `.Dispose()` explicitly — discarding the return value silently leaks the callback.

---
