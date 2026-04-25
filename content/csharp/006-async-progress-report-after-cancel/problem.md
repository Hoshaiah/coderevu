---
slug: async-progress-report-after-cancel
track: csharp
orderIndex: 6
title: Progress Callback After Task Cancelled
difficulty: easy
tags:
  - async
  - cancellation
  - progress
language: csharp
---

## Context

This code lives in `Services/ImportService.cs` in an ASP.NET Core background import worker. It accepts a large CSV file upload, processes rows asynchronously, and reports progress back to a `SignalR` hub via an `IProgress<int>` delegate passed in from the controller. The cancellation token comes from `HttpContext.RequestAborted` so that processing stops if the client disconnects.

Operators report that after a client disconnects mid-import, the hub occasionally throws `ObjectDisposedException` and logs show progress callbacks firing on a connection that has already been cleaned up. The import job appears to keep running for several seconds after cancellation is requested.

The team checked that `ct.IsCancellationRequested` is evaluated inside the loop — that part looks correct at a glance. The issue is more subtle.

## Buggy code

```csharp
public async Task ImportRowsAsync(
    IEnumerable<CsvRow> rows,
    IProgress<int> progress,
    CancellationToken ct)
{
    int processed = 0;

    foreach (var row in rows)
    {
        if (ct.IsCancellationRequested)
            break;

        await ProcessRowAsync(row);

        processed++;
        progress.Report(processed);
    }
}

private async Task ProcessRowAsync(CsvRow row)
{
    await _dbContext.SaveChangesAsync();
}
```
