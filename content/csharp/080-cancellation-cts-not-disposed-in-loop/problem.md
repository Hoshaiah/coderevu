---
slug: cancellation-cts-not-disposed-in-loop
track: csharp
orderIndex: 80
title: CancellationTokenSource Leak in Loop
difficulty: medium
tags:
  - cancellation
  - disposal
  - resource-management
language: csharp
---

## Context

This background service lives in `Workers/SensorPoller.cs`. It continuously polls a list of IoT sensor endpoints, applying a per-poll timeout. The service is registered with `AddHostedService` and runs for the lifetime of the process, which can be weeks between deployments. Each sensor is polled every 10 seconds; there are roughly 200 sensors.

Operations reports that the process's handle count (visible in Task Manager and Prometheus `process_handles` metric) grows at a rate of about 1,200 handles per minute. After roughly 12 hours the handle count exceeds the OS limit and the process crashes with `IOException: Not enough storage is available to process this command`. The crash happens even when all sensors are responding successfully.

PerfView shows the handle growth correlates exactly with the polling loop frequency and sensor count. Changing the poll interval from 10 s to 60 s slows the growth proportionally, which helped the team isolate the loop as the source.

## Buggy code

```csharp
public class SensorPoller : BackgroundService
{
    private readonly IReadOnlyList<string> _sensorUrls;
    private readonly HttpClient _http;
    private readonly ILogger<SensorPoller> _log;

    public SensorPoller(IReadOnlyList<string> sensorUrls, HttpClient http, ILogger<SensorPoller> log)
    {
        _sensorUrls = sensorUrls;
        _http = http;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            foreach (var url in _sensorUrls)
            {
                var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                cts.CancelAfter(TimeSpan.FromSeconds(3));

                try
                {
                    var reading = await _http.GetFromJsonAsync<SensorReading>(url, cts.Token);
                    _log.LogInformation("Sensor {Url}: {Value}", url, reading?.Value);
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Failed to poll {Url}", url);
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}
```
