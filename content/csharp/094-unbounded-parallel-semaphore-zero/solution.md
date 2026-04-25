## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — SemaphoreSlim initialised with zero permits deadlocks all callers immediately
// ------------------------------------------------------------------------
public class S3UploadService
{
    private readonly IAmazonS3 _s3;
    private readonly SemaphoreSlim _throttle;

    public S3UploadService(IAmazonS3 s3)
    {
        _s3 = s3;
        // CHANGE 1: initialCount changed from 0 to 4 so permits are available immediately. SemaphoreSlim(initialCount, maxCount): initialCount=0 means zero slots open at startup, so every WaitAsync blocks forever. Setting initialCount equal to maxCount (4) means all 4 permits are available from the first call.
        _throttle = new SemaphoreSlim(4, 4);
    }

    public async Task UploadAsync(string bucket, string key, Stream data, CancellationToken cancellationToken = default)
    {
        Console.WriteLine("Starting upload");
        // CHANGE 2: pass cancellationToken to WaitAsync so callers can time out or cancel instead of hanging indefinitely when all permits are exhausted.
        await _throttle.WaitAsync(cancellationToken);
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

## Explanation

### Issue 1: SemaphoreSlim initialCount Zero Deadlocks All Callers

**Problem:** Every call to `UploadAsync` logs "Starting upload" and then hangs forever at `_throttle.WaitAsync()`. No upload ever completes, no error is thrown, and the thread pool fills with stuck tasks.

**Fix:** Replace `new SemaphoreSlim(0, 4)` with `new SemaphoreSlim(4, 4)` so that `initialCount` matches `maxCount`. This is the CHANGE 1 site in the constructor.

**Explanation:** `SemaphoreSlim`'s first constructor argument is `initialCount` — the number of permits available right now. The second argument is `maxCount` — the ceiling that `Release()` can never exceed. When `initialCount` is 0, there are zero permits on day one, so the first `WaitAsync()` call blocks immediately waiting for someone to call `Release()`. Nobody ever calls `Release()` before entering the semaphore (that would be backwards), so every caller waits forever. Setting `initialCount` to 4 means four callers can enter concurrently from the start; each one calls `Release()` in the `finally` block, returning the permit for the next caller. A related pitfall: if `initialCount` were set higher than `maxCount`, the constructor throws `ArgumentOutOfRangeException` at startup — so both values must be kept in sync.

---

### Issue 2: WaitAsync Called Without CancellationToken

**Problem:** If all 4 permits are genuinely exhausted (e.g., 4 slow uploads are in flight), a 5th caller waits with no timeout and no cancellation path. In production, a request timeout at the HTTP layer closes the connection, but the task keeps waiting inside the service, leaking resources silently.

**Fix:** Add a `CancellationToken cancellationToken = default` parameter to `UploadAsync` and forward it to `_throttle.WaitAsync(cancellationToken)`. This is the CHANGE 2 site.

**Explanation:** `SemaphoreSlim.WaitAsync()` has an overload that accepts a `CancellationToken`. When the token is cancelled (e.g., because the HTTP request was aborted or a timeout fired), `WaitAsync` throws `OperationCanceledException` and the caller unwinds cleanly without holding any permit. Without this, the task sits in the semaphore queue until a permit arrives or the process restarts. Using `default` as the parameter default means existing callers that don't supply a token continue to work as before, while new callers (e.g., ASP.NET controller actions that receive `HttpContext.RequestAborted`) can pass it through automatically.
