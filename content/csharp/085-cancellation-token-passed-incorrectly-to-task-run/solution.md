## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationToken Only Cancels Scheduling
// ------------------------------------------------------------------------

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
        // CHANGE 2: Check the token before queuing work so an already-cancelled request is rejected immediately without touching the thread pool.
        ct.ThrowIfCancellationRequested();

        // CHANGE 1: Pass ct to Task.Run AND into the async body; the overload ct parameter only gates scheduling, so ct must also reach GenerateAsync to cancel in-flight work.
        return Task.Run(async () =>
        {
            _log.LogInformation("Generating thumbnails for {UploadId}", uploadId);
            await _imageProcessor.GenerateAsync(imageData, new[] { 128, 256, 512 }, ct);
            _log.LogInformation("Thumbnails done for {UploadId}", uploadId);
        }, ct);
    }
}
```

## Explanation

### Issue 1: Token Does Not Cancel In-Progress Work

**Problem:** After a request is cancelled, thumbnail generation continues running to completion. Operators see CPU and I/O usage continuing for several seconds per cancelled upload, which compounds under bursty traffic.

**Fix:** The `ct` argument passed to `_imageProcessor.GenerateAsync` in the async lambda is already present in the original code — the real problem is that this is actually correct for in-body cancellation, but the surrounding context obscures that the `Task.Run` overload's `ct` parameter does NOT cancel the body once it starts. The fix makes this contract explicit with a comment and confirms `ct` flows into `GenerateAsync` so the processor can abort mid-stream. No token change is needed on `GenerateAsync` itself since the buggy code already passes `ct` there, but the `Task.Run` `ct` parameter must be understood as scheduling-only.

**Explanation:** `Task.Run(action, ct)` uses `ct` only to decide whether to schedule the task onto the thread pool at all. Once a thread picks up the work item and the `async` lambda starts executing, `Task.Run`'s own `ct` has no further effect. The only way to interrupt the body is to pass `ct` into the awaited operations inside it — which the existing code does via `_imageProcessor.GenerateAsync`. The confusion arises because developers often assume the `Task.Run` token covers the entire lifetime of the task, but it covers only the pre-start window. A related pitfall: if `GenerateAsync` internally spawns further tasks without forwarding `ct`, those too will ignore cancellation.

---

### Issue 2: No Early Exit for Already-Cancelled Token

**Problem:** If the HTTP request is cancelled before `GenerateAsync` is even called, the task is still enqueued onto the thread pool and a thread will pick it up, log a start message, and begin calling `_imageProcessor.GenerateAsync` before the token check inside that method fires. This wastes a thread-pool slot and triggers unnecessary allocations.

**Fix:** Add `ct.ThrowIfCancellationRequested()` at the top of `GenerateAsync`, before `Task.Run`, so a synchronous `OperationCanceledException` is thrown immediately if the token is already signalled at call time.

**Explanation:** `Task.Run`'s scheduling check only fires when the thread pool actually dequeues the item, which may happen after a short delay. During that window the token state is not re-evaluated. By calling `ct.ThrowIfCancellationRequested()` synchronously on the calling thread, you reject the request at the earliest possible moment — before any allocation or queuing happens. The returned `Task` from `Task.Run` would eventually transition to `Cancelled` on its own, but `ThrowIfCancellationRequested` makes the cancellation surface immediately to the caller and avoids queueing work that will be immediately abandoned. This is especially important under bursty load where the thread pool queue can grow faster than threads drain it.
