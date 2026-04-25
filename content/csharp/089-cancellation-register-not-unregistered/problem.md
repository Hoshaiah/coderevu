---
slug: cancellation-register-not-unregistered
track: csharp
orderIndex: 89
title: CancellationToken Registration Never Removed
difficulty: hard
tags:
  - cancellation
  - disposal
  - memory-leak
language: csharp
---

## Context

This class lives in `Messaging/KafkaConsumerLoop.cs` and bridges a long-running Kafka consumer with ASP.NET Core's graceful shutdown token. When the application is asked to stop, the `CancellationToken` signals the Kafka consumer's `Poll` loop to exit cleanly. The class is registered as a singleton hosted service.

After several weeks of operation, the service's memory footprint grows steadily by roughly 2 MB per hour. A heap dump taken in staging shows thousands of live `CancellationTokenRegistration` objects and their associated closures, even though the consumer loop is still running normally. The team confirmed there are no code paths that restart the consumer — it runs exactly once for the application lifetime.

A colleague reviewed the code and noted that the growing object count correlates precisely with the number of Kafka messages processed, not with the number of consumer restarts.

## Buggy code

```csharp
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

            using var cts = new CancellationTokenSource();

            stoppingToken.Register(() => cts.Cancel());

            await _handler.HandleAsync(result.Message, cts.Token);
        }

        _consumer.Close();
    }
}
```
