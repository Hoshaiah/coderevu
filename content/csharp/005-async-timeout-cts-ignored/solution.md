## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Timeout CancellationToken Never Observed
// ------------------------------------------------------------------------

public class HttpPollingService
{
    private readonly HttpClient _client;
    private readonly ILogger<HttpPollingService> _logger;

    public HttpPollingService(HttpClient client, ILogger<HttpPollingService> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task<string> FetchWithTimeoutAsync(string url)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var request = new HttpRequestMessage(HttpMethod.Get, url);
        // CHANGE 1: Pass cts.Token to SendAsync so the HTTP request is actually cancelled when the 5-second timeout fires.
        var response = await _client.SendAsync(request, cts.Token);
        response.EnsureSuccessStatusCode();

        // CHANGE 2: Pass cts.Token to ReadAsStringAsync so a slow body read is also subject to the same timeout.
        return await response.Content.ReadAsStringAsync(cts.Token);
    }
}
```

## Explanation

### Issue 1: CancellationToken Not Passed to SendAsync

**Problem:** The service hangs for 60-90 seconds during network blips instead of aborting after 5 seconds. The `TaskCanceledException` never appears in the logs because the HTTP call runs to whatever timeout the underlying socket or OS enforces.

**Fix:** Add `cts.Token` as the second argument to `_client.SendAsync(request, cts.Token)`. This is the exact overload that wires the token into the outgoing HTTP pipeline.

**Explanation:** `CancellationTokenSource` with a `TimeSpan` schedules a timer that fires `Cancel()` on the token after 5 seconds. But `CancellationToken` is opt-in — nothing is cancelled unless the token is handed to the code doing the work. `HttpClient.SendAsync` has an overload that accepts a `CancellationToken`; when that token is cancelled, `SendAsync` throws `TaskCanceledException` and tears down the request. Without passing the token, `SendAsync` uses `CancellationToken.None` internally, which is never cancelled, so the timer fires and nobody is listening. A related pitfall: `HttpClient.Timeout` is set to `Timeout.InfiniteTimeSpan` here by design, which means there is no fallback timeout at the client level either.

---

### Issue 2: CancellationToken Not Passed to ReadAsStringAsync

**Problem:** Even after fixing `SendAsync`, the response body read in `ReadAsStringAsync` has no timeout. A server that sends headers quickly but streams the body slowly can still hold the call open well past 5 seconds.

**Fix:** Replace `response.Content.ReadAsStringAsync()` with `response.Content.ReadAsStringAsync(cts.Token)` so the body read is cancelled by the same token.

**Explanation:** `SendAsync` completes as soon as the response headers arrive (in the default `HttpCompletionOption.ResponseHeadersRead` mode is opt-in, but even with `ResponseContentRead` the body buffering can stall). `ReadAsStringAsync` then performs a separate async read of the body stream. If the remote server trickles data or stalls mid-body, this call blocks. Passing `cts.Token` propagates the same 5-second deadline to the body read. Note that by the time `ReadAsStringAsync` is called, some of the 5-second window is already consumed by `SendAsync`, so both operations share the same deadline rather than each getting 5 seconds independently — which is the correct behavior for a single per-request timeout.
