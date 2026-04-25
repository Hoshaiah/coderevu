---
slug: async-cancellation-finally-deadlock
track: csharp
orderIndex: 18
title: Await in Finally Block Deadlocks
difficulty: hard
tags:
  - async
  - cancellation
  - deadlock
language: csharp
---

## Context

This code lives in `Services/StreamingReportService.cs` in an ASP.NET Core 6 application running on .NET 6 with `SynchronizationContext` present (integration tested with a test server). The `StreamReportAsync` method streams a generated report to the HTTP response. A `finally` block was added to ensure an audit record is written even if the request is cancelled or an error occurs.

During load testing, certain requests hang permanently after the client disconnects. The server-side logs show "Starting report stream" but never show either "Report stream complete" or "Audit written". Thread pool starvation metrics climb slowly as more hangs accumulate. Killing the request from the client side (curl --max-time) does not unblock the server.

The developer added `ConfigureAwait(false)` to some awaits but not the one in the `finally`, and was not aware that awaiting inside `finally` interacts with cancellation in a specific way.

## Buggy code

```csharp
public class StreamingReportService
{
    private readonly IAuditLog _audit;
    private readonly IReportGenerator _generator;
    private readonly ILogger<StreamingReportService> _logger;

    public StreamingReportService(
        IAuditLog audit,
        IReportGenerator generator,
        ILogger<StreamingReportService> logger)
    {
        _audit = audit;
        _generator = generator;
        _logger = logger;
    }

    public async Task StreamReportAsync(
        string reportId,
        Stream output,
        CancellationToken ct)
    {
        _logger.LogInformation("Starting report stream {ReportId}", reportId);
        try
        {
            await _generator.GenerateAsync(reportId, output, ct);
        }
        finally
        {
            await _audit.WriteAsync(reportId, "streamed", ct);
            _logger.LogInformation("Audit written for {ReportId}", reportId);
        }

        _logger.LogInformation("Report stream complete {ReportId}", reportId);
    }
}
```
