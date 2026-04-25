---
slug: cancellation-token-ignored
track: csharp
orderIndex: 77
title: >-
  Passed CancellationToken is never observed, causing slow shutdown and wasted
  work
difficulty: medium
tags:
  - cancellation
  - async
  - resource-management
  - cooperative-cancellation
language: csharp
---

## Context

An ASP.NET Core background service processes items from a queue. When the application is stopped (Ctrl-C or a deployment rolling restart), the host waits up to 5 seconds for graceful shutdown before killing the process. Developers notice that shutdown always hits the 5-second timeout and the process is killed mid-batch, sometimes leaving half-processed records.

## Buggy code

```csharp
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
        while (true)
        {
            var messages = await _queue.DequeueBatchAsync(batchSize: 50);
            if (messages.Count == 0)
            {
                await Task.Delay(TimeSpan.FromSeconds(2));
                continue;
            }

            foreach (var msg in messages)
            {
                var record = Transform(msg);
                await _store.SaveAsync(record);
            }

            await _queue.AcknowledgeBatchAsync(messages);
        }
    }

    private Record Transform(Message msg) => new Record(msg.Body);
}
```
