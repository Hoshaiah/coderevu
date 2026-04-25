---
slug: cancellation-objectdisposed-not-handled
track: csharp
orderIndex: 79
title: Cancellation Raises Wrong Exception Type
difficulty: medium
tags:
  - cancellation
  - error-handling
  - async
language: csharp
---

## Context

This code lives in `ImageDownloader.cs`, a media ingestion service that pulls images from third-party CDNs and stores them in blob storage. A `CancellationToken` is threaded through from the top-level job scheduler so that in-flight downloads can be stopped cleanly when the service shuts down or when a job is cancelled by the user.

When a cancellation is triggered during an active `HttpClient.GetAsync` call, the service logs an unhandled `ObjectDisposedException` or `TaskCanceledException` with the message `"The operation was canceled"` but the stack trace points to the `catch (OperationCanceledException)` block somehow not catching it. Some cancellations succeed cleanly; others leak the exception up and crash the worker task.

The discrepancy turned out to depend on which overload of `GetAsync` is called internally by `HttpClient` and which exception type it surfaces when the token fires — but the real bug is in how the caller distinguishes real cancellation from a timeout.

## Buggy code

```csharp
public class ImageDownloader
{
    private readonly HttpClient _client;

    public ImageDownloader(HttpClient client)
    {
        _client = client;
    }

    public async Task<byte[]> DownloadAsync(string url, CancellationToken ct)
    {
        try
        {
            HttpResponseMessage response = await _client.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsByteArrayAsync();
        }
        catch (OperationCanceledException)
        {
            // Caller cancelled — return empty to signal skip
            return Array.Empty<byte>();
        }
        catch (HttpRequestException ex)
        {
            throw new DownloadException($"HTTP error downloading {url}", ex);
        }
    }
}
```
