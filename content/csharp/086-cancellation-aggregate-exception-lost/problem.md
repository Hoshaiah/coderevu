---
slug: cancellation-aggregate-exception-lost
track: csharp
orderIndex: 86
title: OperationCanceledException Lost in WhenAll
difficulty: hard
tags:
  - cancellation
  - async
  - error-handling
language: csharp
---

## Context

This code is in `Processors/BatchUploader.cs`, an internal tool that uploads files in parallel to an S3-compatible store. It accepts a list of file paths, fans them out with `Task.WhenAll`, and uses a `CancellationToken` from the caller to support cooperative cancellation (e.g. Ctrl+C in the CLI host).

When the user presses Ctrl+C mid-upload, the CLI sometimes exits cleanly with a 'cancelled' message, but other times it exits with an unhandled `AggregateException` containing a mix of `OperationCanceledException` and `IOException`. The CI pipeline has also reported occasional `AggregateException` leaks from the test harness that presses cancellation after a fixed delay.

The team already verified that each individual upload task correctly observes the token. They confirmed the `CancellationTokenSource` is linked properly from the `IHostApplicationLifetime` signal. The inconsistency they can't explain is why the top-level `catch (OperationCanceledException)` sometimes doesn't fire.

## Buggy code

```csharp
public class BatchUploader
{
    private readonly IStorageClient _storage;
    private readonly ILogger<BatchUploader> _logger;

    public BatchUploader(IStorageClient storage, ILogger<BatchUploader> logger)
    {
        _storage = storage;
        _logger = logger;
    }

    public async Task UploadAllAsync(IReadOnlyList<string> filePaths, CancellationToken cancellationToken)
    {
        try
        {
            var tasks = filePaths.Select(path =>
                _storage.UploadFileAsync(path, cancellationToken));

            await Task.WhenAll(tasks);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Upload batch cancelled.");
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Upload batch failed.");
            throw;
        }
    }
}
```
