---
slug: async-progress-callback-on-wrong-context
track: csharp
orderIndex: 15
title: Progress Callback Captures Wrong SynchronizationContext
difficulty: medium
tags:
  - async
  - concurrency
  - ui
language: csharp
---

## Context

`FileUploadService.cs` is used in a WinForms desktop application to upload large files to an S3-compatible object store. The service accepts an `IProgress<int>` instance to report percentage progress back to the UI. The calling form updates a `ProgressBar` control from the callback.

Users on machines with older .NET Framework runtimes report that the progress bar sometimes does not update during uploads. More commonly, they see a `System.InvalidOperationException: Control accessed from a thread other than the thread it was created on`. This only happens for files larger than about 20 MB — small files always work. The exception originates from inside the progress callback.

The team checked the calling code: `Progress<int>` is constructed on the UI thread before the upload starts, which should capture the UI `SynchronizationContext` and marshal callbacks back. They added a debug assert to verify the calling thread is the UI thread at construction time — it is. The investigation stalled there.

## Buggy code

```csharp
public class FileUploadService
{
    private readonly HttpClient _http;

    public FileUploadService(HttpClient http) => _http = http;

    public async Task UploadAsync(
        string filePath,
        IProgress<int> progress,
        CancellationToken ct)
    {
        const int chunkSize = 4 * 1024 * 1024; // 4 MB
        var fileBytes = await File.ReadAllBytesAsync(filePath, ct);
        int totalChunks = (int)Math.Ceiling((double)fileBytes.Length / chunkSize);

        for (int i = 0; i < totalChunks; i++)
        {
            int offset = i * chunkSize;
            int length = Math.Min(chunkSize, fileBytes.Length - offset);
            var chunk = new ReadOnlyMemory<byte>(fileBytes, offset, length);

            await _http
                .PostAsync("/upload", new ReadOnlyMemoryContent(chunk.ToArray()), ct)
                .ConfigureAwait(false);

            int pct = (int)((i + 1) / (double)totalChunks * 100);
            progress.Report(pct);
        }
    }
}
```
