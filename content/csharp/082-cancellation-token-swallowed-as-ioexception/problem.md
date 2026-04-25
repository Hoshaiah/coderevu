---
slug: cancellation-token-swallowed-as-ioexception
track: csharp
orderIndex: 82
title: Cancellation Caught as IOException
difficulty: medium
tags:
  - cancellation
  - error-handling
  - io
  - async
language: csharp
---

## Context

This method is in `Storage/BlobDownloader.cs` and downloads a binary blob from Azure Blob Storage via `HttpClient`. It is called from an API endpoint that sets a 30-second `CancellationToken` deadline via `CancellationTokenSource.CancelAfter`. The calling code relies on catching `OperationCanceledException` to detect timeouts and return `HTTP 504` to the client.

Users intermittently receive `HTTP 500` instead of `504` when downloads time out. Logs show `IOException: The response stream was aborted` but no `OperationCanceledException`. The `504` branch in the controller is never reached. Load tests confirm the issue reproduces consistently when the token is cancelled during active stream reading.

The team verified the `CancellationToken` is correctly plumbed into the method signature. The problem is in how the stream read loop handles exceptions.

## Buggy code

```csharp
public async Task<byte[]> DownloadAsync(string blobUrl, CancellationToken ct)
{
    using var response = await _http.GetAsync(blobUrl, HttpCompletionOption.ResponseHeadersRead, ct);
    response.EnsureSuccessStatusCode();

    using var stream = await response.Content.ReadAsStreamAsync();
    using var ms = new MemoryStream();

    var buffer = new byte[81920];
    int read;

    try
    {
        while ((read = await stream.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
            ms.Write(buffer, 0, read);
    }
    catch (IOException)
    {
        throw new InvalidOperationException("Blob download failed due to a network error.");
    }

    return ms.ToArray();
}
```
