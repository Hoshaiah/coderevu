---
slug: unbounded-parallel-semaphore-zero
track: csharp
orderIndex: 94
title: SemaphoreSlim initialised with zero permits deadlocks all callers immediately
difficulty: medium
tags:
  - concurrency
  - deadlock
  - semaphore
  - api-misuse
language: csharp
---

## Context

A data export service was recently updated to limit concurrency when writing to a shared S3 bucket. The developer added a `SemaphoreSlim` to cap simultaneous uploads at 4. After the deployment, 100% of export requests hang indefinitely. The service accepts the request, logs "Starting upload", then nothing. No errors, no timeouts, no CPU usage.

## Buggy code

```csharp
public class S3UploadService
{
    private readonly IAmazonS3 _s3;
    private readonly SemaphoreSlim _throttle;

    public S3UploadService(IAmazonS3 s3)
    {
        _s3 = s3;
        _throttle = new SemaphoreSlim(0, 4);
    }

    public async Task UploadAsync(string bucket, string key, Stream data)
    {
        Console.WriteLine("Starting upload");
        await _throttle.WaitAsync();
        try
        {
            await _s3.PutObjectAsync(new PutObjectRequest
            {
                BucketName = bucket,
                Key = key,
                InputStream = data
            });
        }
        finally
        {
            _throttle.Release();
        }
    }
}
```
