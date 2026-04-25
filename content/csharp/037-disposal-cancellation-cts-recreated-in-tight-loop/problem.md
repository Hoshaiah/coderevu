---
slug: disposal-cancellation-cts-recreated-in-tight-loop
track: csharp
orderIndex: 37
title: CancellationTokenSource Leaked in Polling Loop
difficulty: medium
tags:
  - disposal
  - cancellation
  - memory-leak
language: csharp
---

## Context

`Workers/HealthCheckPoller.cs` is a hosted background service that polls downstream dependencies every 10 seconds and broadcasts results to a metrics sink. Each poll is given a 3-second timeout. The service has been running in production for several months.

Operations noticed memory usage climbs steadily by ~5 MB per hour and never stabilizes. A heap dump revealed tens of thousands of live `CancellationTokenSource` instances and associated `Timer` objects (created internally by `CancelAfter`). There are no obvious leaks anywhere else in the codebase.

The team confirmed there is no async work leaking outside the poller and that the hosted service itself starts and stops cleanly. The leak correlates exactly with the poll frequency.

## Buggy code

```csharp
public class HealthCheckPoller : BackgroundService
{
    private readonly IHealthCheckService _healthCheck;
    private readonly IMetricsSink _metrics;

    public HealthCheckPoller(IHealthCheckService healthCheck, IMetricsSink metrics)
    {
        _healthCheck = healthCheck;
        _metrics = metrics;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            cts.CancelAfter(TimeSpan.FromSeconds(3));

            try
            {
                var result = await _healthCheck.CheckAsync(cts.Token);
                _metrics.Record(result);
            }
            catch (OperationCanceledException) { /* timeout or shutdown */ }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}
```
