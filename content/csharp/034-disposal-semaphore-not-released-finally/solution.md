## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — SemaphoreSlim Leaked on Exception Path
// ------------------------------------------------------------------------

public class ExternalApiGateway
{
    private readonly HttpClient _http;
    private readonly SemaphoreSlim _concurrencyLimit = new SemaphoreSlim(5, 5);

    public ExternalApiGateway(HttpClient http)
    {
        _http = http;
    }

    public async Task<PaymentResponse> ChargeAsync(
        PaymentRequest request,
        CancellationToken cancellationToken)
    {
        await _concurrencyLimit.WaitAsync(cancellationToken);
        // CHANGE 1: Wrap everything after a successful WaitAsync in try/finally so Release() is guaranteed even when PostAsync or EnsureSuccessStatusCode throws.
        try
        {
            var json = JsonSerializer.Serialize(request);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _http.PostAsync("/charge", content, cancellationToken);
            response.EnsureSuccessStatusCode();

            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            // CHANGE 1: Removed the Release() call from the happy path here; the finally block handles it unconditionally.
            return JsonSerializer.Deserialize<PaymentResponse>(body)!;
        }
        finally
        {
            // CHANGE 1: Release() is now inside finally, so every acquired slot is returned regardless of success or exception.
            _concurrencyLimit.Release();
        }
    }
}
```

## Explanation

### Issue 1: Semaphore slot not released on exception

**Problem:** When `_http.PostAsync` throws (e.g., a timeout or a network error) or `EnsureSuccessStatusCode` throws an `HttpRequestException` on a 429/503 response, execution jumps out of `ChargeAsync` without ever reaching the `_concurrencyLimit.Release()` call at the bottom. Each unhandled exception permanently consumes one of the five slots. After five such failures the semaphore count reaches zero and every subsequent `WaitAsync` blocks forever, making the service appear hung.

**Fix:** The explicit `_concurrencyLimit.Release()` call on the happy path is removed and replaced with a `try/finally` block (CHANGE 1) that wraps all code executed after `WaitAsync` returns. The `finally` block calls `_concurrencyLimit.Release()` unconditionally, so the slot is returned whether the body completes normally or throws any exception.

**Explanation:** `SemaphoreSlim` is a counting resource guard: `WaitAsync` decrements the count and `Release` increments it. If `Release` is never called, the count never recovers. A `try/finally` is the standard pattern to guarantee cleanup even in the presence of exceptions, analogous to how `using` guarantees `Dispose`. The `finally` block runs before the exception propagates up the call stack, so the slot is freed before the caller even sees the error. One related pitfall: if `WaitAsync` itself throws because `cancellationToken` is already cancelled, the semaphore was never decremented, so the `Release` must not run. Because the `try` block starts after `WaitAsync` returns successfully, cancellation of the wait itself correctly bypasses the `finally`-guarded `Release`.

---
