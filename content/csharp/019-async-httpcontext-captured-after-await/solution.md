## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — HttpContext Captured After Await Resumes
// ------------------------------------------------------------------------

public class RequestAuditMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IAuditLogger _audit;

    public RequestAuditMiddleware(RequestDelegate next, IAuditLogger audit)
    {
        _next = next;
        _audit = audit;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // CHANGE 1+2+3: Capture all values from HttpContext synchronously before any await so that connection teardown cannot invalidate them and the timestamp reflects request arrival.
        var path = context.Request.Path.Value;
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var userId = context.User.FindFirst("sub")?.Value;
        var requestTimestamp = DateTime.UtcNow;

        await _next(context);

        // CHANGE 2: StatusCode is safe to read after the pipeline because ASP.NET Core sets it during response writing, which happens before InvokeAsync returns; all other volatile fields are already captured above.
        var statusCode = context.Response.StatusCode;

        await _audit.LogAsync(new AuditEntry
        {
            Path = path,
            IpAddress = ip,
            UserId = userId,
            StatusCode = statusCode,
            Timestamp = requestTimestamp
        });
    }
}
```

## Explanation

### Issue 1: HttpContext accessed after connection teardown

**Problem:** After `await _next(context)` returns, the underlying TCP connection may already be closed and the ASP.NET Core feature collection disposed. Reading `context.Connection.RemoteIpAddress` at that point throws `ObjectDisposedException: IFeatureCollection has been disposed`, which is exactly the sporadic error reported in production.

**Fix:** Move the `ip` assignment (and the `userId` and `path` reads) to before the `await _next(context)` call, capturing the string values while the connection is guaranteed to be alive.

**Explanation:** ASP.NET Core's `HttpContext` is backed by a feature collection tied to the Kestrel connection. When the client closes the TCP connection, Kestrel can dispose that feature collection even while the server-side middleware is still running its post-pipeline logic. On a slow endpoint, there is a window between when the response bytes are flushed and when `InvokeAsync` resumes after the await; a client that disconnects immediately after receiving the response can cause the feature collection to be disposed inside that window. Capturing the value as a plain `string` before the await eliminates the dependency on the live connection object. The null-coalescing workaround the team added only masked the symptom for `RemoteIpAddress` without preventing the `ObjectDisposedException` that comes from accessing a disposed feature.

---

### Issue 2: Volatile context state read after pipeline completes

**Problem:** `context.User` is read after the pipeline finishes. Middleware further down the chain (e.g., authentication middleware that resets the principal on the way back out, or response-caching middleware) can mutate `context.User` during pipeline unwinding, so the `userId` logged may not match the user who made the request.

**Fix:** Capture `userId` with `context.User.FindFirst("sub")?.Value` before `await _next(context)`, alongside `path` and `ip`. `StatusCode` is left after the await because it is only meaningful once the response has been written.

**Explanation:** Middleware executes in a bidirectional pipeline: it runs code before calling `_next`, and then again after `_next` returns. Middleware registered after `RequestAuditMiddleware` runs between those two points and is free to replace `context.User`. In practice this happens with token-refresh or sliding-expiration middleware that re-issues a principal. By reading `context.User` before `_next`, the audit record reflects the authenticated identity at the moment the request entered this middleware, which is the semantically correct value for audit purposes. `StatusCode` must still be read after the await because the response status is set by downstream handlers and is not known until they complete.

---

### Issue 3: Audit timestamp reflects write time, not request-arrival time

**Problem:** `DateTime.UtcNow` is evaluated after `await _next(context)` and after `await _audit.LogAsync(...)` begins, so on slow endpoints the logged timestamp can be seconds or minutes later than when the request actually arrived. Audit trails become unreliable for reconstructing the order of events.

**Fix:** Assign `var requestTimestamp = DateTime.UtcNow` before `await _next(context)` and pass `requestTimestamp` to `AuditEntry.Timestamp` instead of a fresh `DateTime.UtcNow` call.

**Explanation:** The original code calls `DateTime.UtcNow` at the point the `AuditEntry` object is constructed, which is after the entire downstream pipeline and any I/O in it have completed. On an endpoint that does a slow downstream HTTP call, that delay could be several seconds. Capturing the timestamp at middleware entry records when ASP.NET Core began processing the request, which is the meaningful moment for compliance audit logs. A related pitfall: if the audit logger itself is slow or retries, calling `DateTime.UtcNow` inside `LogAsync` would be even later; by passing in the pre-captured value, the entry is immutable and independent of logging latency.
