---
slug: cancellation-token-passed-incorrectly-to-task-run
track: csharp
orderIndex: 85
title: CancellationToken Only Cancels Scheduling
difficulty: hard
tags:
  - cancellation
  - async
  - task
language: csharp
---

## Context

This code lives in `Workers/ThumbnailGenerator.cs`. When a user uploads an image, a background task is enqueued to generate thumbnails at multiple resolutions. The task is offloaded to the thread pool via `Task.Run`. A `CancellationToken` derived from the HTTP request's `RequestAborted` token is passed to allow cancellation if the user navigates away.

Operators observe that thumbnail generation continues to consume CPU and I/O for several seconds after a request is cancelled — even when the upload client has clearly disconnected. The request logs show `OperationCanceledException` is raised correctly at the HTTP layer, but thread-pool threads remain active generating thumbnails for those cancelled requests. Under bursty upload traffic this causes CPU spikes.

The team verified the `CancellationToken` is correctly wired from `HttpContext.RequestAborted` all the way to this method. They also verified that `_imageProcessor.GenerateAsync` does accept and honour a `CancellationToken` parameter. The issue is specifically in how the token is passed to `Task.Run`.

## Buggy code

```csharp
public class ThumbnailGenerator
{
    private readonly IImageProcessor _imageProcessor;
    private readonly ILogger<ThumbnailGenerator> _log;

    public ThumbnailGenerator(IImageProcessor imageProcessor, ILogger<ThumbnailGenerator> log)
    {
        _imageProcessor = imageProcessor;
        _log = log;
    }

    public Task GenerateAsync(byte[] imageData, string uploadId, CancellationToken ct)
    {
        return Task.Run(async () =>
        {
            _log.LogInformation("Generating thumbnails for {UploadId}", uploadId);
            await _imageProcessor.GenerateAsync(imageData, new[] { 128, 256, 512 }, ct);
            _log.LogInformation("Thumbnails done for {UploadId}", uploadId);
        }, ct);
    }
}
```
