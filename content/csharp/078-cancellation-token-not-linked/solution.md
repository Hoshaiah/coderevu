## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationToken Not Linked to Timeout
// ------------------------------------------------------------------------

public class PaymentGatewayClient
{
    private readonly HttpClient _http;

    public PaymentGatewayClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<PaymentResult> ChargeAsync(
        ChargeRequest request,
        CancellationToken callerToken = default)
    {
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // CHANGE 1: Link callerToken with timeoutCts so that either a caller cancellation OR the 5-second timeout cancels the combined token; without this, callerToken is never observed.
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(callerToken, timeoutCts.Token);

        var json = JsonSerializer.Serialize(request);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        // CHANGE 2: Use linkedCts.Token instead of timeoutCts.Token so both the timeout and the caller's cancellation are respected on the HTTP POST.
        var response = await _http.PostAsync("/charge", content, linkedCts.Token);
        response.EnsureSuccessStatusCode();

        // CHANGE 3: Pass linkedCts.Token to ReadAsStringAsync so the body read is also bounded by the 5-second timeout and caller cancellation, not just left to run freely.
        var body = await response.Content.ReadAsStringAsync(linkedCts.Token);
        return JsonSerializer.Deserialize<PaymentResult>(body)!;
    }
}
```

## Explanation

### Issue 1: callerToken never observed

**Problem:** When the web framework cancels `callerToken` (e.g. the user closes the browser), `ChargeAsync` does not stop. The HTTP request continues consuming a connection from the pool until the gateway responds or the global 30-second timeout fires. During a traffic spike this keeps connections open far longer than intended and exhausts the pool.

**Fix:** `CancellationTokenSource.CreateLinkedTokenSource(callerToken, timeoutCts.Token)` is added immediately after creating `timeoutCts`. The resulting `linkedCts.Token` is then used everywhere in the method instead of `timeoutCts.Token`.

**Explanation:** `CancellationTokenSource.CreateLinkedTokenSource` produces a new `CancellationTokenSource` that is cancelled as soon as *any* of the supplied tokens is cancelled. Without it, `callerToken` is a method parameter that is never read again after it is received. Passing `timeoutCts.Token` directly to `PostAsync` means only the 5-second wall-clock path can cancel the request; the caller's token is invisible. After the fix, a browser disconnect propagates through `callerToken` → `linkedCts` → `PostAsync`, and the 5-second wall-clock path still works because `timeoutCts` is also linked. One pitfall: `linkedCts` must be disposed (the `using` declaration handles this) or it will hold a registration on `callerToken` for the lifetime of the program.

---

### Issue 2: PostAsync uses only the timeout token, not the linked token

**Problem:** Even after a linked CTS is created (the fix above), passing the wrong token to `PostAsync` means the fix has no effect on the HTTP call itself. The symptom is the same: the POST hangs past 5 seconds when the gateway is slow.

**Fix:** `_http.PostAsync("/charge", content, timeoutCts.Token)` is changed to `_http.PostAsync("/charge", content, linkedCts.Token)` so both cancellation signals are observed during the outbound HTTP round-trip.

**Explanation:** `HttpClient.PostAsync` polls the token it receives, not any other token in scope. If you pass `timeoutCts.Token` only, the call does time out after 5 seconds — but `callerToken` cancellations are still ignored. Once the linked CTS exists, you must thread `linkedCts.Token` through every async call in the method; forgetting even one leaves a window where the operation runs uncancelled. This is the root reason the 5-second timeout *appears* not to fire in some reports: if the caller's token was already cancelled before `PostAsync` was called, `timeoutCts.Token` is not yet cancelled, so the call proceeds.

---

### Issue 3: ReadAsStringAsync not cancellable

**Problem:** In the original code, `ReadAsStringAsync(timeoutCts.Token)` is actually present, but because no linked token is created the caller token is still ignored during the body read. If the fix for issues 1 and 2 is applied but the body read still uses `timeoutCts.Token`, a caller cancellation after headers arrive but before the body is fully read will not stop the download.

**Fix:** `response.Content.ReadAsStringAsync(timeoutCts.Token)` is changed to `response.Content.ReadAsStringAsync(linkedCts.Token)` so the same combined token governs the body streaming phase.

**Explanation:** The HTTP response arrives in two phases: the status line and headers come first (governed by `PostAsync`), then the body is streamed (governed by `ReadAsStringAsync`). A slow gateway can send headers quickly and then drip-feed the body over many seconds. Without `linkedCts.Token` here, a cancelled `callerToken` or an expired timeout that fires between the two phases will not abort the body read. The `using` on `linkedCts` also ensures that once `ReadAsStringAsync` returns, any internal registration against `callerToken` is cleaned up immediately rather than lingering until the GC collects the CTS.
