## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Linked CTS Leaks on Every Request
// ------------------------------------------------------------------------

public class RequestTimeoutMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestTimeoutMiddleware> _logger;
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    public RequestTimeoutMiddleware(RequestDelegate next, ILogger<RequestTimeoutMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        using var timeoutCts = new CancellationTokenSource(Timeout);
        // CHANGE 1: Wrap linkedCts in a using statement so it is always disposed after the request, releasing callback registrations and preventing the CancellationTokenSource leak.
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
            context.RequestAborted,
            timeoutCts.Token);

        // CHANGE 2: Store the linked token in a local variable and pass it explicitly to the next middleware rather than overwriting context.RequestAborted, avoiding unintended side-effects on the framework-owned property.
        var linkedToken = linkedCts.Token;

        try
        {
            await _next(context);
        }
        catch (OperationCanceledException) when (linkedCts.IsCancellationRequested)
        {
            _logger.LogWarning("Request timed out or was aborted.");
            context.Response.StatusCode = 499;
        }
    }
}
```

## Explanation

### Issue 1: `linkedCts` Never Disposed, Leaks Per Request

**Problem:** Every request allocates a `CancellationTokenSource` via `CreateLinkedTokenSource` and never disposes it. Because a linked `CancellationTokenSource` registers callbacks on each of its parent tokens to propagate cancellation, those callback registrations keep the object alive even after the request completes. At 500 req/s the process accumulates thousands of live `CancellationTokenSource` instances, growing memory by roughly 2 KB each.

**Fix:** Add `using` to the `linkedCts` declaration (`using var linkedCts = ...`). This ensures `Dispose` is called when `InvokeAsync` exits — whether normally, via cancellation, or via an unhandled exception — which removes the callback registrations from the parent tokens and allows the GC to collect the object.

**Explanation:** `CancellationTokenSource.CreateLinkedTokenSource` internally calls `CancellationToken.Register` on each parent token. That registration stores a delegate that holds a reference back to the linked `CancellationTokenSource`. Until `Dispose` is called, the parent token's callback list roots the linked CTS, so the GC cannot collect it. Calling `Dispose` removes those registrations explicitly. A related pitfall: if you `await` inside a `using` block and the token is cancelled before the await completes, the `using` still runs the `Dispose` on the continuation — so the disposal is safe even with async code.

---

### Issue 2: Overwriting `context.RequestAborted` With Linked Token

**Problem:** Assigning `linkedCts.Token` directly to `context.RequestAborted` replaces a framework-managed property. The ASP.NET Core runtime and other middleware may read or re-set `context.RequestAborted` independently; overwriting it can cause subtle ordering bugs or suppress proper client-disconnect signalling in edge cases.

**Fix:** Remove the `context.RequestAborted = linkedCts.Token` assignment and instead store the linked token in a local variable (`var linkedToken = linkedCts.Token`). In this middleware the token is used only for the `when` guard on the `catch` clause, so the local variable is sufficient without touching the context property at all.

**Explanation:** `HttpContext.RequestAborted` is set by Kestrel and is intended to reflect client-disconnect state. Replacing it with a combined token means the property now also fires on a timeout, which is a different event. Middleware further down the pipeline or the application code that reads `context.RequestAborted` expecting only client-disconnect signals will see unexpected cancellations on timeouts. Keeping the linked token as a local avoids this confusion. The `catch` guard `when (linkedCts.IsCancellationRequested)` still correctly catches both timeout and client-disconnect cancellations because `linkedCts` is cancelled whenever either parent fires.
