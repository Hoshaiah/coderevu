## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — SemaphoreSlim Leaked on Async Exception
// ------------------------------------------------------------------------

public class ExternalApiGateway
{
    private readonly HttpClient _http;
    private readonly SemaphoreSlim _sem = new SemaphoreSlim(10, 10);

    public ExternalApiGateway(HttpClient http)
    {
        _http = http;
    }

    public async Task<ApiResult> CallAsync(ApiRequest request, CancellationToken ct)
    {
        await _sem.WaitAsync(ct);
        // CHANGE 1: Wrap everything after WaitAsync in try/finally so the semaphore slot is always released, even when SendAsync, EnsureSuccessStatusCode, or ReadFromJsonAsync throws an exception or the cancellation token fires mid-flight.
        try
        {
            var response = await _http.SendAsync(
                new HttpRequestMessage(HttpMethod.Post, "/api/process")
                {
                    Content = JsonContent.Create(request)
                }, ct);

            response.EnsureSuccessStatusCode();

            var result = await response.Content.ReadFromJsonAsync<ApiResult>(ct);

            // CHANGE 2: Move Release inside try so it is the last statement before the finally block, keeping normal-path behaviour identical while the finally guarantees release on any abnormal exit.
            return result!;
        }
        finally
        {
            _sem.Release();
        }
    }
}
```

## Explanation

### Issue 1: Semaphore slot leaked on exception

**Problem:** When `_http.SendAsync`, `EnsureSuccessStatusCode`, or `ReadFromJsonAsync` throws (e.g., `HttpRequestException` for a 5xx response or a network failure), execution jumps out of `CallAsync` before `_sem.Release()` is reached. The acquired slot is never returned to the pool. Over time, every transient HTTP error permanently removes one slot from the semaphore's count of 10, and eventually `CurrentCount` hits 0, after which every new call blocks on `WaitAsync` forever.

**Fix:** Surround the code between `WaitAsync` and `Release` with a `try/finally` block, and move `_sem.Release()` into the `finally` clause. The `return result!` statement in the `try` body triggers `finally` on the normal path too, so no separate `Release` call is needed before the return.

**Explanation:** `SemaphoreSlim.WaitAsync` decrements the internal counter and gives the caller exclusive use of one slot. If the caller does not call `Release`, that counter decrement is permanent for the lifetime of the object — the semaphore has no timeout or automatic cleanup mechanism. Because the singleton lives for the process lifetime, each leaked slot accumulates. The `try/finally` pattern is the standard way to guarantee paired acquire/release for any resource; it fires whether the `try` exits via `return`, via a thrown exception, or via a `OperationCanceledException` from the cancellation token. A related pitfall: if `WaitAsync` itself throws (e.g., because the token is already cancelled before the wait begins), the slot was never acquired, so `Release` must not be called — placing `WaitAsync` before the `try` block, as in the fix, handles this correctly.

---

### Issue 2: Semaphore slot leaked on mid-flight cancellation

**Problem:** If the `CancellationToken` is cancelled after `WaitAsync` returns (slot acquired) but before `_sem.Release()` is reached, an `OperationCanceledException` is thrown by `SendAsync` or `ReadFromJsonAsync`. This is the same leak path as Issue 1 but triggered by cancellation rather than an HTTP error. In a busy ASP.NET Core host, request timeouts or client disconnects cancel tokens frequently, making this a second source of permanent slot loss.

**Fix:** The same `try/finally` block introduced for Issue 1 covers this case. `finally` runs on `OperationCanceledException` just as it does on any other exception, so the slot is released before the exception propagates to the caller.

**Explanation:** `CancellationToken` propagation through `await` causes the awaited task to throw `OperationCanceledException`. From the perspective of the `try/finally`, that is just another exception — `finally` runs unconditionally. Without the `try/finally`, the slot acquired by `WaitAsync` is abandoned. One subtle edge: if the token is cancelled between the `WaitAsync` call and its completion (i.e., while waiting), `WaitAsync` itself throws and the slot was never taken, so `Release` should not be called. The fix already handles this because `WaitAsync` sits outside the `try` block.
