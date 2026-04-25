---
slug: async-progress-after-completed-task
track: csharp
orderIndex: 16
title: Progress Reported After Task Completes
difficulty: medium
tags:
  - async
  - cancellation
  - race-condition
language: csharp
---

## Context

`Workers/FileProcessorWorker.cs` is a long-running background task that processes large uploaded files and reports progress to a SignalR hub. The `IProgress<int>` instance is created by the hub, captures the `HttpContext`, and sends a SignalR message back to the connected client on each report.

After file processing completes and the HTTP request scope is torn down, the app intermittently logs `System.ObjectDisposedException: IServiceProvider has been disposed` or `System.NullReferenceException` originating from inside the `IProgress<int>.Report` callback. The issue happens only for large files that take more than a few seconds to process.

The team ruled out thread-safety issues with the file parsing logic itself. They noticed the exceptions always come from the progress callback, never from the main processing loop.

## Buggy code

```csharp
public async Task ProcessFileAsync(
    Stream fileStream,
    IProgress<int> progress,
    CancellationToken ct)
{
    var lines = new List<string>();
    using var reader = new StreamReader(fileStream);

    while (!reader.EndOfStream)
    {
        ct.ThrowIfCancellationRequested();
        lines.Add(await reader.ReadLineAsync());
    }

    int processed = 0;
    foreach (var line in lines)
    {
        ct.ThrowIfCancellationRequested();
        await ProcessLineAsync(line, ct);
        processed++;
        int pct = (int)((double)processed / lines.Count * 100);
        // Fire progress and immediately continue — no await here
        _ = Task.Run(() => progress.Report(pct));
    }
}
```
