---
slug: cancellation-token-passed-to-finalizer-path
track: csharp
orderIndex: 84
title: Cancelled Token Blocks Cleanup Work
difficulty: hard
tags:
  - cancellation
  - async
  - disposal
language: csharp
---

## Context

This code lives in `BlobUploadSession.cs`, a multi-part upload manager for a cloud storage client library. Large files are split into parts and uploaded concurrently. If the caller cancels mid-upload, the session must abort the multipart upload on the server side — otherwise orphaned uploads accumulate and incur storage costs.

The abort logic was added specifically to handle cancellation, but the storage team reports that orphaned multipart uploads are still accumulating at roughly the same rate as before the fix was deployed. CloudWatch metrics show that `AbortMultipartUploadAsync` is being called, but it completes immediately with no effect — the server log shows the requests arriving with an already-expired context.

The team confirmed the abort API itself works correctly when called from a test harness with a fresh `CancellationToken.None`. The bug is in how the existing token is used during cleanup.

## Buggy code

```csharp
public class BlobUploadSession : IAsyncDisposable
{
    private readonly IBlobClient _client;
    private readonly string _uploadId;
    private bool _completed;
    private readonly CancellationToken _ct;

    public BlobUploadSession(
        IBlobClient client,
        string uploadId,
        CancellationToken ct)
    {
        _client   = client;
        _uploadId = uploadId;
        _ct       = ct;
    }

    public async Task UploadPartsAsync(Stream source)
    {
        // ... upload logic omitted
        _completed = true;
    }

    public async ValueTask DisposeAsync()
    {
        if (!_completed)
        {
            // Caller cancelled — abort the multipart upload server-side
            await _client.AbortMultipartUploadAsync(_uploadId, _ct);
        }
    }
}
```
