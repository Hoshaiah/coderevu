---
slug: async-deadlock-result-block
track: csharp
orderIndex: 3
title: Async Result Block Deadlocks
difficulty: easy
tags:
  - async
  - deadlock
  - synchronization-context
language: csharp
---

## Context

This code lives in `ReportController.cs`, an ASP.NET MVC 4 application that generates PDF reports. The controller calls into a shared `ReportService` that was originally written for a background Windows service and never used directly from a web context before.

Operators notice that certain report requests hang indefinitely — the HTTP connection never returns, IIS worker threads pile up, and eventually the app pool recycles. The issue only manifests under the MVC pipeline; calling the same service from a console test harness works perfectly.

The team has already ruled out database timeouts (queries complete quickly in profiling) and network issues. Adding more worker threads via `minWorkerThreads` makes the problem worse, not better, which is a clue something deeper is wrong.

## Buggy code

```csharp
public class ReportController : Controller
{
    private readonly ReportService _reports;

    public ReportController(ReportService reports)
    {
        _reports = reports;
    }

    public ActionResult Download(int reportId)
    {
        var data = _reports.GenerateAsync(reportId).Result;

        var file = new FileContentResult(data, "application/pdf");
        file.FileDownloadName = $"report-{reportId}.pdf";
        return file;
    }
}
```
