---
slug: async-enumerable-sync-blocking-call
track: csharp
orderIndex: 20
title: Sync Block Inside IAsyncEnumerable
difficulty: hard
tags:
  - async
  - async-streams
  - deadlock
  - performance
language: csharp
---

## Context

This code is in `Feeds/EventFeedReader.cs` and exposes a Kafka consumer as a streaming `IAsyncEnumerable<DomainEvent>`. It is consumed by an ASP.NET Core endpoint using `await foreach` to stream events over a long-lived HTTP connection. The Kafka client library being used is `Confluent.Kafka`, which provides a synchronous `Consume(TimeSpan)` API.

Under load, ASP.NET Core worker threads are exhausted and new requests queue indefinitely. Thread pool starvation metrics show all threads parked in a blocking wait. The endpoint works correctly in isolation but degrades badly when many clients connect simultaneously. CPU stays near zero during the stall.

A profiler confirms threads are blocked inside `EventFeedReader`. The developer assumed that wrapping the synchronous call in `Task.Run` would solve the thread pool problem, but the `Task.Run` is placed incorrectly.

## Buggy code

```csharp
public async IAsyncEnumerable<DomainEvent> ReadAsync(
    [EnumeratorCancellation] CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        // Offload the blocking consume to the thread pool
        var result = await Task.Run(() =>
            _consumer.Consume(TimeSpan.FromSeconds(1)));

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
