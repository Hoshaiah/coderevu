## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Timeout CancellationToken Never Fires
// ------------------------------------------------------------------------

public class ExternalSearchClient
{
    private readonly HttpClient _http;
    private readonly TimeSpan _timeout = TimeSpan.FromSeconds(2);

    public ExternalSearchClient(HttpClient http) => _http = http;

    public async Task<SearchResult> SearchAsync(
        string query,
        CancellationToken callerCt)
    {
        // CHANGE 2: Move both CTS declarations outside the try so they are still alive (not disposed) when the catch filter runs.
        using var timeoutCts = new CancellationTokenSource(_timeout);
        using var linkedCts  = CancellationTokenSource.CreateLinkedTokenSource(
            callerCt, timeoutCts.Token);

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get,
                $"/search?q={Uri.EscapeDataString(query)}");

            // CHANGE 1: Pass linkedCts.Token instead of callerCt so the 2-second timeout actually cancels SendAsync.
            var response = await _http.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                linkedCts.Token);

            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<SearchResult>(json)!;
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            throw new TimeoutException($"Search timed out after {_timeout.TotalSeconds}s.");
        }
    }
}
```

## Explanation

### Issue 1: Wrong token passed to SendAsync

**Problem:** Every slow request waits the full 30 seconds instead of being cancelled after 2 seconds. The `catch (OperationCanceledException)` block never fires, and APM shows no `TaskCanceledException`.

**Fix:** Replace `callerCt` with `linkedCts.Token` on the `_http.SendAsync(...)` call. `linkedCts.Token` is the token that combines both the caller cancellation and the 2-second timeout; passing it is what actually arms the timeout against the in-flight HTTP request.

**Explanation:** `CancellationTokenSource.CreateLinkedTokenSource` produces a new CTS whose token is cancelled when *any* of the source tokens are cancelled. The code correctly creates `linkedCts` from `callerCt` and `timeoutCts.Token`, but then ignores it — it hands `callerCt` directly to `SendAsync`. `callerCt` has no knowledge of the 2-second timeout, so `SendAsync` just waits until the caller cancels or the server responds. The fix passes `linkedCts.Token`, which fires at the 2-second mark (or earlier if the caller cancels), causing `SendAsync` to throw `OperationCanceledException` as intended. A related pitfall: if you ever add more `await` calls inside the `try` (such as `ReadAsStringAsync`), make sure to pass `linkedCts.Token` there too, otherwise a slow response body stream will also ignore the timeout.

---

### Issue 2: CTS disposed before catch filter evaluates IsCancellationRequested

**Problem:** When both `using` declarations are inside the `try` block (as they were in the original layout), the `using` scopes end before the `catch ... when (timeoutCts.IsCancellationRequested)` filter runs. On some runtimes, reading `IsCancellationRequested` on a disposed `CancellationTokenSource` throws `ObjectDisposedException`, which escapes as an unhandled exception instead of a `TimeoutException`.

**Fix:** Move both `using var timeoutCts` and `using var linkedCts` declarations above and outside the `try` block. That keeps both objects alive through the entire `try/catch`, so `timeoutCts.IsCancellationRequested` is safe to read in the `when` filter.

**Explanation:** In C#, a `using` declaration inside a `try` block disposes the object when the `try` scope exits — which happens *before* exception filters (`when` clauses) are evaluated. Exception filters run during the first pass of stack unwinding, before any `catch` body executes, so the CTS is already disposed by the time `IsCancellationRequested` is accessed. Moving the declarations outside the `try` means disposal happens at the enclosing method scope, which is after the `catch` block finishes. The current .NET runtime happens to return the last-known value of `IsCancellationRequested` even after disposal, so the bug may be latent rather than consistently visible — but it is undefined behaviour and fails under stricter implementations or future runtime changes.
