## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — HttpContext Accessed After Response Disposes
// ------------------------------------------------------------------------

public class AuditLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IAuditService _audit;

    public AuditLoggingMiddleware(RequestDelegate next, IAuditService audit)
    {
        _next = next;
        _audit = audit;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        await _next(context);

        // CHANGE 3: Capture header value immediately after _next returns, before Kestrel finalises/clears the response headers on the wire.
        var requestId = context.Response.Headers["X-Request-Id"].ToString();

        // CHANGE 3: Capture status code here too — same reason: read while context is still valid and headers are accessible.
        var statusCode = context.Response.StatusCode;

        // CHANGE 1: Removed Task.Run — HttpContext lifetime is tied to the request; accessing it after this method returns risks ObjectDisposedException. Capture all needed values first (done above), then await the write directly so the context is never touched inside a detached task.
        // CHANGE 2: Awaiting the write directly instead of fire-and-forget means exceptions from _audit.WriteAsync propagate normally and are not silently swallowed.
        await _audit.WriteAsync(new AuditEntry
        {
            StatusCode = statusCode,
            RequestId = requestId,
            Timestamp = DateTimeOffset.UtcNow
        });
    }
}
```

## Explanation

### Issue 1: HttpContext accessed inside detached Task

**Problem:** Audit records occasionally show incorrect status codes (always 200) and throw `ObjectDisposedException` referencing `IHttpResponseFeature`. This happens under load in production but not in `TestServer` tests.

**Fix:** Remove `Task.Run` entirely. The values `statusCode` and `requestId` are captured as plain local variables immediately after `await _next(context)`, and `_audit.WriteAsync` is called with `await` directly in `InvokeAsync`.

**Explanation:** ASP.NET Core recycles or disposes the `HttpContext` (and its underlying feature objects like `IHttpResponseFeature`) once the middleware pipeline finishes and the connection is returned to the pool. A `Task.Run` lambda captures the `context` reference but runs on a thread-pool thread that may be scheduled after that disposal. Under low load, the task typically runs before disposal, so tests pass. Under high load, Kestrel can reclaim the context before the lambda runs. Reading `context.Response.StatusCode` at that point either returns a recycled default (200) or throws `ObjectDisposedException`. The fix is to read all values you need while still inside `InvokeAsync` — where the framework guarantees the context is alive — and never pass the context itself into a detached task.

---

### Issue 2: Fire-and-forget silently drops audit write exceptions

**Problem:** If `_audit.WriteAsync` throws (database timeout, connection failure, etc.), the exception is raised on a thread-pool thread with no observer. It is silently swallowed unless a global `TaskScheduler.UnobservedTaskException` handler exists, so audit failures go undetected.

**Fix:** Replace `_ = Task.Run(async () => { ... })` with a direct `await _audit.WriteAsync(...)` call in `InvokeAsync`.

**Explanation:** When you assign a `Task` to `_` without awaiting it, any exception the task raises becomes an "unobserved" task exception. In .NET 4.5+ this no longer crashes the process by default, so the exception disappears. Awaiting the call directly means the exception propagates up through the middleware pipeline to the global exception handler, where it can be logged or returned as a 500. The trade-off is that the HTTP response is already sent by this point (the client already received it), so awaiting here adds latency the client does not see, but it ensures the audit record is reliably written or the failure is surfaced.

---

### Issue 3: Response headers read after Kestrel finalises the response

**Problem:** The `X-Request-Id` header consistently reads as empty in production under load, even though downstream handlers set it correctly. The status code also reads as 200 regardless of the actual response.

**Fix:** Move both `context.Response.Headers["X-Request-Id"].ToString()` and `context.Response.StatusCode` reads to immediately after `await _next(context)` returns, before any async yield or detached task, which is exactly what the reference solution does by placing them as the first two statements after `_next`.

**Explanation:** After `await _next(context)` returns, the response has been handed off to Kestrel for transmission, but the `HttpContext` object is still live and its in-memory state (status code, headers dictionary) still reflects what was set by downstream handlers. However, once you hand off to a `Task.Run`, you introduce an async scheduling gap. Kestrel may finish sending the response and begin resetting the connection state before the lambda runs. On a recycled context, `StatusCode` resets to 200 and the headers dictionary is cleared. Reading the values synchronously, before any `await` or `Task.Run`, ensures you see the values that downstream handlers wrote, not whatever state the context is in after recycling.
