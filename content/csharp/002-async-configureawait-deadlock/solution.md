## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — ConfigureAwait Deadlock in ASP.NET
// ------------------------------------------------------------------------

public class ReportService
{
    private readonly BlobServiceClient _blobClient;

    public ReportService(BlobServiceClient blobClient)
    {
        _blobClient = blobClient;
    }

    public async Task<byte[]> GetReportBytesAsync(string blobName)
    {
        var container = _blobClient.GetBlobContainerClient("reports");
        var blob = container.GetBlobClient(blobName);

        using var ms = new MemoryStream();
        // CHANGE 1: Added ConfigureAwait(false) so the continuation does not try to resume on the captured ASP.NET SynchronizationContext, which is already blocked by the .Result call above it.
        await blob.DownloadToAsync(ms).ConfigureAwait(false);
        return ms.ToArray();
    }
}

// Caller in HomeController.cs
public class HomeController : Controller
{
    private readonly ReportService _reports;

    public HomeController(ReportService reports) { _reports = reports; }

    // CHANGE 2: Changed return type to Task<ActionResult> and added async/await so the controller does not block a thread with .Result, eliminating the deadlock at its source.
    public async Task<ActionResult> Download(string name)
    {
        var bytes = await _reports.GetReportBytesAsync(name);
        return File(bytes, "application/octet-stream", name);
    }
}
```

## Explanation

### Issue 1: Missing ConfigureAwait(false) in async library method

**Problem:** Every `await` inside `GetReportBytesAsync` captures the current `SynchronizationContext` (the ASP.NET one) and tries to resume on it after the awaited work completes. When a caller above holds that context hostage by blocking with `.Result`, the continuation can never run, so the task never finishes, and `.Result` waits forever.

**Fix:** `.ConfigureAwait(false)` is appended to `blob.DownloadToAsync(ms)` at the CHANGE 1 site, telling the runtime the continuation does not need to post back to the captured context and can run on any available thread pool thread instead.

**Explanation:** The ASP.NET (non-Core) `SynchronizationContext` allows only one thread at a time to run within a request. When `Download` calls `.Result`, it parks that one allowed thread in a blocking wait. When the storage download finishes, the `await` machinery tries to post the continuation back to the same context, but the context is already occupied by the blocked `.Result` call. Neither side can proceed. `ConfigureAwait(false)` breaks the cycle: the continuation runs on a thread pool thread that is not gated by the context, so it completes and `.Result` unblocks. Any `await` deeper in the call chain that lacks `ConfigureAwait(false)` can re-introduce the deadlock, so every await in library-level code should carry it.

---

### Issue 2: Blocking synchronously on async method with .Result in controller

**Problem:** `Download` calls `.Result` on an async `Task`, which blocks the request thread while waiting for the result. Under the ASP.NET `SynchronizationContext` this is the action that seizes the one permitted thread, creating the conditions for the deadlock described in Issue 1. Even with `ConfigureAwait(false)` applied everywhere downstream, blocking with `.Result` wastes a thread and risks deadlocks if any future dependency forgets `ConfigureAwait(false)`.

**Fix:** At the CHANGE 2 site, `Download` is changed to `public async Task<ActionResult> Download(string name)` and the `.Result` call is replaced with `await _reports.GetReportBytesAsync(name)`, making the entire call chain async with no blocking waits.

**Explanation:** ASP.NET MVC on .NET Framework supports `async Task<ActionResult>` controller actions directly; the framework awaits the returned task and sends the response when it completes. Switching to `await` releases the request thread back to the thread pool while the I/O is in flight, so no thread holds the `SynchronizationContext` when the continuation tries to resume. This is the correct long-term fix: `ConfigureAwait(false)` in the service layer is a necessary safety net, but making the controller genuinely async removes the blocking call that creates the problematic context-capture scenario in the first place. A common pitfall is assuming unit tests validate this behavior — they don't, because test runners typically have no `SynchronizationContext`, so the deadlock never materialises there.
