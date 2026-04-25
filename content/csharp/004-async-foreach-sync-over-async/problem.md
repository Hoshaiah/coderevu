---
slug: async-foreach-sync-over-async
track: csharp
orderIndex: 4
title: Sync Block Inside Async Foreach
difficulty: easy
tags:
  - async
  - deadlock
  - task
language: csharp
---

## Context

This code lives in `Services/ReportExporter.cs`, a background service in an ASP.NET Core web API. It iterates a list of report IDs fetched from the database and calls an external HTTP endpoint to fetch each report's data before writing it to blob storage. The service runs on startup via `IHostedService`.

Operators notice the worker process hangs indefinitely after the first report is processed. Memory usage climbs slightly over time. CPU stays at 0%. The service never logs the completion message. Killing and restarting the process reproduces it every time.

The team confirmed the HTTP endpoint is healthy and the first request completes successfully. They've ruled out network issues and verified the `CancellationToken` isn't triggered early.

## Buggy code

```csharp
public class ReportExporter : BackgroundService
{
    private readonly IReportClient _client;
    private readonly IBlobStorage _storage;
    private readonly ILogger<ReportExporter> _logger;

    public ReportExporter(
        IReportClient client,
        IBlobStorage storage,
        ILogger<ReportExporter> logger)
    {
        _client = client;
        _storage = storage;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var reportIds = await _client.GetReportIdsAsync(stoppingToken);

        foreach (var id in reportIds)
        {
            var data = _client.FetchReportAsync(id, stoppingToken).Result;
            await _storage.WriteAsync(id, data, stoppingToken);
        }

        _logger.LogInformation("All reports exported.");
    }
}
```
