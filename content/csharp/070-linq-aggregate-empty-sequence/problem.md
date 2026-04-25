---
slug: linq-aggregate-empty-sequence
track: csharp
orderIndex: 70
title: Aggregate Throws on Empty Sequence
difficulty: hard
tags:
  - linq
  - correctness
  - exceptions
language: csharp
---

## Context

This code lives in `Analytics/MetricsAggregator.cs` in a .NET 7 analytics service that computes rolling statistics over a sliding window of sensor readings. The `ComputePeakAsync` method is called every minute from a hosted timer and posts the result to a telemetry endpoint. It has been in production for months without issues.

After a sensor outage window during a maintenance event, the service started crashing every minute with `InvalidOperationException: Sequence contains no elements`. Alerts fire, on-call engineers are paged, and the service requires a manual restart to recover. The outage caused a 15-minute gap in sensor data, but the window slides forward and soon no readings fall within the window — yet the crash persists until data flows again.

The developer looked at the stack trace and saw it points to the `Aggregate` call. They had not realised `Aggregate` behaves differently from `Max` on empty sequences in this edge case.

## Buggy code

```csharp
public class MetricsAggregator
{
    private readonly ISensorRepository _repo;
    private readonly ITelemetryClient _telemetry;

    public MetricsAggregator(ISensorRepository repo, ITelemetryClient telemetry)
    {
        _repo = repo;
        _telemetry = telemetry;
    }

    public async Task ComputePeakAsync(
        string sensorId,
        TimeSpan window,
        CancellationToken ct)
    {
        var since = DateTimeOffset.UtcNow - window;
        var readings = await _repo.GetReadingsAsync(sensorId, since, ct);

        double peak = readings
            .Select(r => r.Value)
            .Aggregate((max, next) => next > max ? next : max);

        await _telemetry.PostAsync(sensorId, "peak", peak, ct);
    }
}
```
