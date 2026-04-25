---
slug: disposal-cancellationtoken-after-using
track: csharp
orderIndex: 36
title: CancellationTokenSource Disposed Before Callback
difficulty: medium
tags:
  - disposal
  - cancellation
  - async
language: csharp
---

## Context

This code is in `ReportExporter.cs`, part of an ASP.NET Core background job system. When a user requests a large CSV export, a `ReportExporter` is created per-request, given a 30-second timeout via its own `CancellationTokenSource`, and awaited. The code combines the per-request timeout source with the request's own `CancellationToken` so exports cancel if the browser disconnects.

About once per day an `ObjectDisposedException: CancellationTokenSource has been disposed` is thrown from deep inside `StreamWriter.FlushAsync`. The stack trace always shows it originates from the linked token's internal callback firing after the method returns. The app does not crash (ASP.NET Core catches it), but the export silently produces a truncated file that gets emailed to the user.

The team confirmed the issue only appears on exports that finish in under a second — fast exports. Slow exports that approach the 30-second limit never reproduce it. Adding `Thread.Sleep(100)` after the main work made it disappear in local testing, which is a strong hint about a race.

## Buggy code

```csharp
public class ReportExporter
{
    private readonly IReportRepository _repo;

    public ReportExporter(IReportRepository repo) => _repo = repo;

    public async Task ExportAsync(
        Stream destination,
        CancellationToken requestCt)
    {
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        using var linkedCts  = CancellationTokenSource.CreateLinkedTokenSource(
            requestCt, timeoutCts.Token);

        var token = linkedCts.Token;

        var rows = await _repo.FetchRowsAsync(token);

        await using var writer = new StreamWriter(destination, leaveOpen: true);
        foreach (var row in rows)
        {
            await writer.WriteLineAsync(row.ToCsvLine().AsMemory(), token);
        }

        await writer.FlushAsync();
    } // <-- linkedCts and timeoutCts disposed here
}
```
