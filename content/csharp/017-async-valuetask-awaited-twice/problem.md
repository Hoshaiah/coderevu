---
slug: async-valuetask-awaited-twice
track: csharp
orderIndex: 17
title: ValueTask Awaited Multiple Times
difficulty: hard
tags:
  - async
  - correctness
  - api-misuse
language: csharp
---

## Context

This code lives in `Infrastructure/CachedMetricsReader.cs`. The class wraps a `IMetricsSource` that exposes a `ValueTask<MetricSnapshot>` API (chosen for performance to avoid heap allocation on the hot path). The caching layer stores the last `ValueTask<MetricSnapshot>` and, when a fresh snapshot is not yet needed, re-awaits the stored task to return the same value without calling the source again.

Under load the service sporadically returns corrupted or zeroed-out metric snapshots. The issue is not reproducible with `await Task.FromResult(...)` but appears when the underlying source uses pooled `IValueTaskSource` objects. Crashes with `InvalidOperationException: An attempt was made to transition a task to a final state when it had already completed` are also observed in some runs.

The team replaced `ValueTask` with `Task` in a test harness and the problem disappeared immediately, which is why the bug was not caught during initial development. They suspect the hot-reload infrastructure but the real cause is in this file.

## Buggy code

```csharp
public class CachedMetricsReader
{
    private readonly IMetricsSource _source;
    private readonly TimeSpan _ttl;
    private ValueTask<MetricSnapshot> _cached;
    private DateTime _cacheTime = DateTime.MinValue;

    public CachedMetricsReader(IMetricsSource source, TimeSpan ttl)
    {
        _source = source;
        _ttl = ttl;
    }

    public async ValueTask<MetricSnapshot> ReadAsync(CancellationToken ct)
    {
        if (DateTime.UtcNow - _cacheTime < _ttl)
        {
            // Cache hit: re-await the stored ValueTask
            return await _cached;
        }

        _cached = _source.GetSnapshotAsync(ct);
        _cacheTime = DateTime.UtcNow;
        return await _cached;
    }
}
```
