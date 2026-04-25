## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationTokenSource Disposed Before Callback
// ------------------------------------------------------------------------

public class OrderProcessor
{
    private readonly HttpClient _http;
    private readonly ILogger<OrderProcessor> _log;

    public OrderProcessor(HttpClient http, ILogger<OrderProcessor> log)
    {
        _http = http;
        _log = log;
    }

    public async Task<OrderResult> ProcessOrderAsync(Order order, CancellationToken requestToken)
    {
        // CHANGE 1: Use a plain `var` (no `using`) and wrap in try/finally so the CTS is disposed only after the awaited work — including any internal HttpClient cancellation callbacks — has fully completed on the current async continuation.
        var cts = CancellationTokenSource.CreateLinkedTokenSource(requestToken);
        try
        {
            cts.CancelAfter(TimeSpan.FromSeconds(5));

            var response = await _http.SendAsync(
                new HttpRequestMessage(HttpMethod.Post, "/inventory/reserve")
                {
                    Content = JsonContent.Create(order)
                },
                cts.Token);

            response.EnsureSuccessStatusCode();

            // CHANGE 2: Pass CancellationToken.None instead of cts.Token so that reading the already-received response body is not aborted by a timeout that has already fired or a token that is about to be disposed.
            var result = await response.Content.ReadFromJsonAsync<OrderResult>(CancellationToken.None);
            return result!;
        }
        finally
        {
            // CHANGE 1 (continued): Dispose here, after all awaited work is done, so HttpClient's internal callback registrations against the token have already been cleaned up by the time Dispose runs.
            cts.Dispose();
        }
    }
}
```

## Explanation

### Issue 1: CTS Disposed Before HttpClient Callbacks Complete

**Problem:** Operators see `ObjectDisposedException: The CancellationTokenSource has been disposed` stack traces originating inside `HttpClient.SendAsync`. The errors appear only under load and never in single-threaded integration tests.

**Fix:** Remove the `using` declaration and replace it with an explicit `try/finally` block. `cts.Dispose()` is called in the `finally` clause, which runs only after the `await` expressions inside the `try` block complete — meaning all async continuations, including HttpClient's internal cleanup, have already finished.

**Explanation:** `using var cts = ...` calls `Dispose()` at the closing brace of the method scope. In an `async` method, that closing brace is reached as soon as the last `return` statement executes on the current continuation. Under load, `HttpClient` internally registers cancellation callbacks against `cts.Token` — for example, to abort the underlying socket read when the timeout fires. Those callbacks can still be executing on a thread-pool thread at the moment the `await` returns and the `using` block disposes the CTS. When a callback tries to access the now-disposed CTS, it throws `ObjectDisposedException`. Under single-threaded test load the timing never produces a race, so the bug is invisible there. Moving `Dispose()` into a `finally` block that runs after all `await`s ensures no outstanding callbacks are racing against disposal.

---

### Issue 2: Response Body Read Cancelled by Already-Fired Timeout Token

**Problem:** `ReadFromJsonAsync` is called with `cts.Token`. If the 5-second timeout fires just as `SendAsync` returns (the response headers arrived in time but the clock expired during the round-trip), the token is already in the cancelled state when `ReadFromJsonAsync` checks it, and the body read throws `OperationCanceledException` even though the full response is already in memory.

**Fix:** Replace `cts.Token` in the `ReadFromJsonAsync` call with `CancellationToken.None`, as shown at the CHANGE 2 site.

**Explanation:** `HttpClient.SendAsync` with `HttpCompletionOption.ResponseContentRead` (the default) buffers the entire response body before returning. Once `SendAsync` returns successfully, the body bytes are already held in memory — there is nothing left to cancel from a network perspective. Passing `cts.Token` to `ReadFromJsonAsync` at that point only gives the timeout an opportunity to abort JSON deserialization of data that is already local. Using `CancellationToken.None` means the deserialization always runs to completion. If you need the caller's `requestToken` to be able to abort deserialization, you can pass `requestToken` directly instead, which avoids tying the operation to the timeout that was only meant to guard the network call.
