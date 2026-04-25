## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Progress Callback Captures Wrong SynchronizationContext
// ------------------------------------------------------------------------

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
        // CHANGE 2: Use a FileStream and read each chunk individually instead of ReadAllBytesAsync so the full file is never held in memory at once.
        long fileLength = new FileInfo(filePath).Length;
        int totalChunks = (int)Math.Ceiling((double)fileLength / chunkSize);
        var buffer = new byte[chunkSize];

        using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, chunkSize, useAsync: true);

        for (int i = 0; i < totalChunks; i++)
        {
            int bytesRead = await fs.ReadAsync(buffer.AsMemory(0, chunkSize), ct);

            // CHANGE 1: Remove ConfigureAwait(false) so that after the await the continuation resumes on the captured SynchronizationContext (the UI thread), making progress.Report() safe to call without a cross-thread exception.
            await _http
                .PostAsync("/upload", new ByteArrayContent(buffer, 0, bytesRead), ct);

            int pct = (int)((i + 1) / (double)totalChunks * 100);
            progress.Report(pct);
        }
    }
}
```

## Explanation

### Issue 1: `ConfigureAwait(false)` Breaks Progress Marshalling

**Problem:** The progress bar occasionally does not update, and on some machines an `InvalidOperationException` fires with "Control accessed from a thread other than the thread it was created on". This only happens for files large enough to require multiple chunks, because each chunk triggers a `progress.Report()` call.

**Fix:** Remove `.ConfigureAwait(false)` from the `_http.PostAsync(...)` call at the CHANGE 1 site so that the continuation after the `await` resumes on the original `SynchronizationContext`.

**Explanation:** `Progress<T>` captures the `SynchronizationContext` that is current when the `Progress<T>` object is constructed. When you call `progress.Report()`, it posts the callback through that captured context — but only if the call to `Report()` itself happens on a thread that still holds that context. With `.ConfigureAwait(false)`, the code after the `await` is scheduled on a thread-pool thread with no `SynchronizationContext`. The `Progress<T>` implementation checks whether the current context matches the captured one; if they differ, it still posts through the captured context, so in theory this should work. The real trap is a subtle runtime version difference: on older .NET Framework runtimes (4.x), certain `Progress<T>` paths invoke the handler inline on the calling thread rather than always posting. This means on those runtimes `progress.Report()` runs directly on the thread-pool thread, which then tries to touch the WinForms `ProgressBar` and throws. Removing `ConfigureAwait(false)` keeps the continuation on the UI thread, so `Report()` fires there regardless of runtime version or `Progress<T>` implementation detail.

---

### Issue 2: Entire File Loaded Into Memory

**Problem:** `File.ReadAllBytesAsync` reads the whole file into a single `byte[]` before any uploading begins. For a 500 MB file this allocates a 500 MB array on the LOH, adding GC pressure and potentially causing `OutOfMemoryException` on 32-bit processes or low-RAM machines. The chunk loop then slices that already-resident array, so no memory is saved by chunking.

**Fix:** At the CHANGE 2 site, replace `File.ReadAllBytesAsync` with a `FileStream` opened with `useAsync: true`, then read each chunk into a reusable `buffer` inside the loop with `fs.ReadAsync`.

**Explanation:** The whole point of chunked uploading is to keep memory usage proportional to the chunk size, not the file size. Allocating a `byte[]` equal to the entire file defeats that: the GC must collect one very large object after the upload finishes, and the peak RSS of the process spikes to at least file size plus working data. Using a `FileStream` with a fixed-size buffer means only one 4 MB buffer is alive at a time. The `useAsync: true` flag on `FileStream` is important: without it, the underlying Windows I/O is synchronous, and `ReadAsync` just wraps the synchronous read in a `Task.Run`, which again bounces to the thread pool and can re-introduce the context problem from Issue 1.
