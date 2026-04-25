---
slug: async-configureawait-deadlock
track: csharp
orderIndex: 2
title: ConfigureAwait Deadlock in ASP.NET
difficulty: easy
tags:
  - async
  - deadlock
  - aspnet
language: csharp
---

## Context

This helper lives in `Infrastructure/ReportService.cs` and is called from an ASP.NET MVC controller action. The surrounding stack is classic ASP.NET (not Core) running on .NET Framework 4.7.2. The method fetches a blob from Azure Storage and returns its contents as a byte array.

Controllers that call `GetReportBytes()` synchronously (via `.Result`) hang indefinitely under load. The request never completes; IIS eventually recycles the worker process. The issue reproduces reliably in staging but not in unit tests, because unit tests don't run under a synchronization context.

The team added logging before and after the `await` and confirmed the log line *before* the await fires but the one *after* never does. They ruled out network timeouts — the Azure Storage call itself completes in milliseconds when called standalone.

## Buggy code

```csharp
public class ReportService
{
    private readonly BlobServiceClient _blobClient;

    public ReportService(BlobServiceClient blobClient)
    {
        _blobClient = blobClient;
    }

    public async Task<byte[]> GetReportBytesAsync(string blobName)
    {
        var container = _blobClient.GetBlobContainerClient("reports");
        var blob = container.GetBlobClient(blobName);

        using var ms = new MemoryStream();
        await blob.DownloadToAsync(ms);
        return ms.ToArray();
    }
}

// Caller in HomeController.cs
public class HomeController : Controller
{
    private readonly ReportService _reports;

    public HomeController(ReportService reports) { _reports = reports; }

    public ActionResult Download(string name)
    {
        var bytes = _reports.GetReportBytesAsync(name).Result;
        return File(bytes, "application/octet-stream", name);
    }
}
```
