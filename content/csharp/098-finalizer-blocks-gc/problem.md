---
slug: finalizer-blocks-gc
track: csharp
orderIndex: 98
title: >-
  Implementing a finalizer on a managed-only class causes GC promotion and
  memory pressure
difficulty: hard
tags:
  - performance
  - garbage-collection
  - finalizer
  - dispose-pattern
language: csharp
---

## Context

A high-throughput event processing service creates and discards thousands of `EventBatch` objects per second. Memory profiling shows the Gen2 heap growing steadily and large-object collection pauses spiking. An `EventBatch` holds only managed references (a `List<Event>` and a `string`), but profiling shows most `EventBatch` objects are ending up in the finalizer queue.

## Buggy code

```csharp
public class EventBatch : IDisposable
{
    private bool _disposed;
    public List<Event> Events { get; } = new();
    public string BatchId { get; }

    public EventBatch(string batchId)
    {
        BatchId = batchId;
    }

    ~EventBatch()
    {
        Dispose(false);
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    protected virtual void Dispose(bool disposing)
    {
        if (_disposed) return;
        if (disposing)
        {
            Events.Clear();
        }
        _disposed = true;
    }
}
```
