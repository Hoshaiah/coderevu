## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Cancellation Caught as IOException
// ------------------------------------------------------------------------

public async Task<byte[]> DownloadAsync(string blobUrl, CancellationToken ct)
{
    using var response = await _http.GetAsync(blobUrl, HttpCompletionOption.ResponseHeadersRead, ct);
    response.EnsureSuccessStatusCode();

    // CHANGE 2: pass ct so cancellation is observed before any reading begins, not just during the loop.
    using var stream = await response.Content.ReadAsStreamAsync(ct);
    using var ms = new MemoryStream();

    var buffer = new byte[81920];
    int read;

    try
    {
        while ((read = await stream.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
            ms.Write(buffer, 0, read);
    }
    // CHANGE 1: check ct.IsCancellationRequested (or catch OperationCanceledException first) so an IOException that wraps a cancellation is re-thrown as OperationCanceledException, not swallowed as InvalidOperationException.
    catch (IOException) when (!ct.IsCancellationRequested)
    {
        throw new InvalidOperationException("Blob download failed due to a network error.");
    }

    return ms.ToArray();
}
```

## Explanation

### Issue 1: IOException Swallows Cancellation

**Problem:** When the `CancellationToken` fires while `stream.ReadAsync` is in progress, the .NET HTTP stack aborts the response stream and wraps the cancellation in an `IOException` ("The response stream was aborted"). The `catch (IOException)` block matches this exception, discards it, and throws `InvalidOperationException`. The `OperationCanceledException` never reaches the controller, so the `504` branch is never hit and the client gets `500`.

**Fix:** Add a `when (!ct.IsCancellationRequested)` exception filter to the `catch (IOException)` clause. When the token has been cancelled, the filter evaluates to `false`, the catch block is skipped, and the runtime continues unwinding until it finds a handler for `OperationCanceledException` — which is the controller's `504` handler.

**Explanation:** The .NET `HttpClient` response stream reads are ultimately backed by a socket. When a `CancellationToken` fires mid-read, the socket is torn down and the immediate signal the stream layer raises is an `IOException`. The `OperationCanceledException` is present as the inner exception, but `catch (IOException)` matches the outer type. The exception filter `when (!ct.IsCancellationRequested)` is evaluated before the catch body runs, so when cancellation is the cause, the filter returns `false` and the handler is bypassed entirely, preserving the correct exception type for upstream callers. A related pitfall: a genuine network drop can also set `ct.IsCancellationRequested` if the token was already cancelled for an unrelated reason, so if precise attribution matters you can also check `ex.InnerException is OperationCanceledException`.

---

### Issue 2: ReadAsStreamAsync Ignores CancellationToken

**Problem:** `response.Content.ReadAsStreamAsync()` is called without passing `ct`. If the token is cancelled between receiving the response headers and starting the read loop, this call proceeds without checking cancellation, slightly delaying the timeout response and leaving a window where the method does unnecessary work.

**Fix:** Replace `response.Content.ReadAsStreamAsync()` with `response.Content.ReadAsStreamAsync(ct)`. The overload accepting a `CancellationToken` was introduced in .NET 5 and causes the call to throw `OperationCanceledException` immediately if the token is already cancelled.

**Explanation:** `HttpCompletionOption.ResponseHeadersRead` makes `GetAsync` return as soon as headers arrive, so the body has not been read yet. Between that point and the read loop, a small amount of async work happens, including obtaining the stream object. Without `ct`, that window is blind to cancellation. Passing `ct` to `ReadAsStreamAsync` closes this gap. It is a minor improvement in isolation, but it also makes the method consistent: every async call that accepts a token should receive one, so cancellation is honoured at every suspension point and the method fails fast regardless of where in the download lifecycle the timeout fires.
