## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — HttpResponseMessage Disposal Abandons Stream
// ------------------------------------------------------------------------

public class WeatherClient
{
    private readonly HttpClient _http;

    public WeatherClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<WeatherData> GetCurrentAsync(string stationId)
    {
        // CHANGE 1: Wrap response in 'using' so HttpResponseMessage.Dispose() is called on every exit path, releasing the underlying connection buffer and network stream immediately instead of waiting for the finalizer.
        using var response = await _http.GetAsync(
            $"/stations/{stationId}/current",
            HttpCompletionOption.ResponseHeadersRead);

        // CHANGE 2: EnsureSuccessStatusCode is called inside the 'using' block so that when it throws on a non-success status the 'using' still disposes the response and drains/closes the body stream, preventing a secondary leak on error paths.
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync();
        var data = await JsonSerializer.DeserializeAsync<WeatherData>(stream);
        return data!;
    }
}
```

## Explanation

### Issue 1: HttpResponseMessage Never Disposed

**Problem:** Every 30-second poll allocates a new `HttpResponseMessage` that holds a reference to a pooled `HttpConnection` buffer and the response body stream. Without `Dispose()` being called, these objects stay reachable until the GC finalizer thread eventually runs `~HttpResponseMessage`. Over hours of polling the accumulation of unreleased buffers drives RSS from 80 MB to 256 MB, at which point the OOMKiller fires.

**Fix:** Add `using var response =` on the line that calls `_http.GetAsync(...)`. This ensures `response.Dispose()` is called at the end of the `using` scope — or on any exception — on every code path through the method.

**Explanation:** `HttpResponseMessage` implements `IDisposable`. Its `Dispose()` method calls `Dispose()` on `HttpContent`, which in turn closes and releases the underlying `Stream` obtained from the connection pool. When `ResponseHeadersRead` is used (as it is here), the body stream is handed directly from the pooled `HttpConnection`; the connection cannot be returned to the pool until that stream is closed. Without `using`, the only recourse is the finalizer, which runs on the GC finalizer thread at an unpredictable time and only after the object has survived at least one GC cycle. At a 30-second poll rate the finalizer simply can't keep up, so buffers accumulate. The `GC.Collect()` experiment the team ran forced a full collection including finalizable objects, which freed the memory and confirmed this mechanism. Wrapping with `using` makes disposal deterministic and eliminates the accumulation entirely.

---

### Issue 2: Error-Path Response Body Left Open

**Problem:** When the weather API returns a non-2xx status, `EnsureSuccessStatusCode()` throws an `HttpRequestException`. Because `response` was not in a `using` block, the exception unwinds the stack without disposing the response, leaving the error-response body stream open and the connection unreturnable to the pool until finalization.

**Fix:** Because `EnsureSuccessStatusCode()` is called inside the `using var response` block introduced in CHANGE 1, the `using` scope's disposal now runs even when `EnsureSuccessStatusCode` throws, covering the error path without any additional code.

**Explanation:** `using` in C# compiles to a `try/finally` block where `Dispose()` is called in the `finally` clause. This means `Dispose()` runs whether control leaves the block normally or via an exception. Before the fix, an HTTP 500 from the weather API would cause `EnsureSuccessStatusCode` to throw, skip all remaining statements including any manual `Dispose()` call a developer might have added after reading the stream, and leave the response rooted. With `using var response`, the finally clause fires unconditionally. A related pitfall: if you read `response.Content` after calling `response.Dispose()`, you get an `ObjectDisposedException`; the correct order — read stream first, then let `using` close it — is already present in the existing code.
