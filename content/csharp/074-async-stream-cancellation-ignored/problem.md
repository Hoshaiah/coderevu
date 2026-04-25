---
slug: async-stream-cancellation-ignored
track: csharp
orderIndex: 74
title: CancellationToken Dropped in Async Stream
difficulty: easy
tags:
  - cancellation
  - async
  - streams
language: csharp
---

## Context

This code lives in `Services/ReportExporter.cs` inside an ASP.NET Core background service that streams large CSV exports to Azure Blob Storage. The method is called by a hosted service that passes a `CancellationToken` tied to the application's graceful shutdown signal.

Operators have noticed that when the service is restarted mid-export, the process hangs for 30–60 seconds before the pod is forcibly killed by Kubernetes. The application shutdown log shows the cancellation token fires immediately, but the exporter keeps running through thousands of rows before the pod is SIGKILL'd.

The developer already verified that the `BlobUploadStream.WriteAsync` overload being called does accept a `CancellationToken`. They also confirmed that the `cancellationToken` parameter is correctly wired at the call site. The issue is somewhere inside the loop itself.

## Buggy code

```csharp
public async Task ExportReportAsync(
    IAsyncEnumerable<ReportRow> rows,
    Stream destination,
    CancellationToken cancellationToken)
{
    await using var writer = new StreamWriter(destination, leaveOpen: true);

    await writer.WriteLineAsync("Id,Name,Amount,Date");

    await foreach (var row in rows)
    {
        var line = $"{row.Id},{row.Name},{row.Amount},{row.Date:yyyy-MM-dd}";
        await writer.WriteLineAsync(line);
    }

    await writer.FlushAsync();
}
```
