## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Cancellation Raises Wrong Exception Type
// ------------------------------------------------------------------------

public class ImageDownloader
{
    private readonly HttpClient _client;

    public ImageDownloader(HttpClient client)
    {
        _client = client;
    }

    public async Task<byte[]> DownloadAsync(string url, CancellationToken ct)
    {
        try
        {
            HttpResponseMessage response = await _client.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();
            // CHANGE 2: pass ct so that cancellation is honoured while reading the response body, not just during the header phase.
            return await response.Content.ReadAsByteArrayAsync(ct);
        }
        catch (OperationCanceledException ex)
        {
            // CHANGE 1: only treat the exception as a clean user cancellation when our own token fired; if ct was not cancelled the exception came from HttpClient's internal timeout and must not be silenced.
            if (ct.IsCancellationRequested)
            {
                return Array.Empty<byte>();
            }
            throw new DownloadException($"HTTP timeout or unexpected cancellation downloading {url}", ex);
        }
        catch (HttpRequestException ex)
        {
            throw new DownloadException($"HTTP error downloading {url}", ex);
        }
    }
}
```

## Explanation

### Issue 1: Timeout Cancellation Silently Swallowed

**Problem:** When `HttpClient` exhausts its `Timeout`, it cancels an internal `CancellationTokenSource` and throws a `TaskCanceledException` (which derives from `OperationCanceledException`). The catch block intercepts this exception and returns `Array.Empty<byte>()` as if the caller requested a skip, hiding the timeout entirely. The worker task finishes silently, no retry is attempted, and the image is lost.

**Fix:** Inside the `catch (OperationCanceledException ex)` block, add an `if (ct.IsCancellationRequested)` guard. Only return the empty array when the caller's token is the one that fired; otherwise rethrow a `DownloadException` wrapping the original exception.

**Explanation:** `TaskCanceledException` is a subclass of `OperationCanceledException`, so a single `catch (OperationCanceledException)` catches both user-initiated cancellation and `HttpClient`-initiated timeout cancellation. The way to tell them apart at the call site is to inspect `ct.IsCancellationRequested` — if the caller's token is not cancelled, the exception originated from somewhere else (the internal timeout token). Checking `ex.CancellationToken == ct` is an alternative but is less reliable across all `HttpClient` implementations because `HttpClient` may chain tokens. The `IsCancellationRequested` check is the most portable guard. A related pitfall: if you later add a linked `CancellationTokenSource` inside the method, you must check the original caller token, not the linked one, to preserve the same semantics.

---

### Issue 2: Body Streaming Ignores Cancellation Token

**Problem:** `ReadAsByteArrayAsync()` is called without `ct`, so after the response headers arrive any cancellation signal is ignored until the entire body has been buffered. For large images this can stall a shutdown for seconds or minutes after the cancellation was requested.

**Fix:** Replace `response.Content.ReadAsByteArrayAsync()` with `response.Content.ReadAsByteArrayAsync(ct)`. The overload that accepts a `CancellationToken` was added in .NET 5 and is the correct call site marked as `// CHANGE 2`.

**Explanation:** `GetAsync` with a `CancellationToken` monitors the token only until the response headers are received and returned to the caller. Once `GetAsync` completes, the token is no longer watched by that call. Reading the body is a separate async I/O operation, and without forwarding `ct` it runs to completion regardless of what happens to the token. On a slow CDN connection serving a 20 MB image, the worker task can remain alive long after the scheduler has asked it to stop. Passing `ct` to `ReadAsByteArrayAsync` lets the runtime abort the socket read immediately when the token fires, and the resulting `OperationCanceledException` is then handled by the guard added in Issue 1.
