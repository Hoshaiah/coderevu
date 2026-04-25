---
slug: disposal-using-disposes-before-return
track: csharp
orderIndex: 27
title: Disposed Stream Returned to Caller
difficulty: easy
tags:
  - disposal
  - streams
  - resource-management
language: csharp
---

## Context

This helper is in `Infrastructure/BlobStorageService.cs` and is responsible for fetching a file from Azure Blob Storage and returning a readable `Stream` to the caller. The controller layer then passes the stream directly to `File()` in an ASP.NET Core response, which reads the stream lazily during serialization.

Users intermittently receive corrupted or empty file downloads. The error varies: sometimes the response body is 0 bytes, sometimes it throws `ObjectDisposedException: Cannot access a closed Stream` in the middleware layer. The issue is not reproducible in unit tests because those tests call `.ToArray()` on the stream immediately.

The team checked for network timeouts and SDK version mismatches and found nothing. They added retries on the blob download, but the problem persists.

## Buggy code

```csharp
public async Task<Stream> DownloadFileAsync(string containerName, string blobName)
{
    var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
    var blobClient = containerClient.GetBlobClient(blobName);

    using var memoryStream = new MemoryStream();
    var response = await blobClient.DownloadToAsync(memoryStream);

    if (!response.IsError)
    {
        memoryStream.Position = 0;
        return memoryStream;
    }

    throw new InvalidOperationException(
        $"Blob download failed with status {response.Status}");
}
```
