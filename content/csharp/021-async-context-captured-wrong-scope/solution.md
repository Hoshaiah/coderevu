## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — HttpContext Captured Across Await Boundary
// ------------------------------------------------------------------------

public class AuditMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ChannelWriter<AuditEntry> _auditChannel;

    public AuditMiddleware(RequestDelegate next, ChannelWriter<AuditEntry> auditChannel)
    {
        _next = next;
        _auditChannel = auditChannel;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value;
        var method = context.Request.Method;

        // CHANGE 1: Capture all HttpContext-derived values before awaiting _next so they are read while the context is still valid and owned by this request.
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var remoteIp = context.Connection.RemoteIpAddress?.ToString();

        await _next(context);

        // CHANGE 2: StatusCode is read immediately after _next returns and before the channel await, while the response object is still in scope and has its final value.
        var statusCode = context.Response.StatusCode;

        var entry = new AuditEntry
        {
            Path = path,
            Method = method,
            // CHANGE 2: Use the locally captured statusCode instead of reading context.Response.StatusCode after a second await boundary.
            StatusCode = statusCode,
            // CHANGE 1: Use locally captured userId and remoteIp instead of reading from context after _next completes.
            UserId = userId,
            RemoteIp = remoteIp
        };

        // CHANGE 3: Pass context.RequestAborted so the channel write is cancelled if the request is torn down, preventing indefinite blocking or unobserved exceptions.
        await _auditChannel.WriteAsync(entry, context.RequestAborted);
    }
}
```

## Explanation

### Issue 1: HttpContext Read After Context Lifetime

**Problem:** Under load, the ASP.NET Core runtime can recycle or dispose an `HttpContext` shortly after the request pipeline finishes. Reading `context.User` or `context.Connection.RemoteIpAddress` after `await _next(context)` returns may happen after the context has been returned to a pool or reset, which is why `UserId` is wrong and `RemoteIpAddress` is null in production logs.

**Fix:** Before the `await _next(context)` call, two new local variables are introduced: `userId` (from `context.User.FindFirstValue(...)`) and `remoteIp` (from `context.Connection.RemoteIpAddress?.ToString()`). The `AuditEntry` object then uses these locals instead of reading from `context` again.

**Explanation:** When `await _next(context)` completes, the downstream middleware and the response have already been flushed to the client. At that point ASP.NET Core considers the request "done" and may begin recycling the `HttpContext`. Reading `context.User` or `context.Connection` at that point races against the recycle. Because the bug only occurs under concurrent load, integration tests that run requests one at a time never trigger the recycle, so the tests pass. Capturing the values before the await eliminates the race entirely — you hold a plain `string` reference, which is not tied to the `HttpContext` lifetime at all. A related pitfall: do not capture the `ClaimsPrincipal` object itself; capture the string value you actually need, because `ClaimsPrincipal` can also hold references back into the `HttpContext`.

---

### Issue 2: StatusCode Read Across Second Await Boundary

**Problem:** `context.Response.StatusCode` is read inside the `AuditEntry` initializer, which sits between `await _next(context)` and `await _auditChannel.WriteAsync(entry)`. If the channel applies back-pressure, the second await suspends the method, and `context.Response` may be in a disposed or reset state by the time execution resumes and the property is evaluated.

**Fix:** A local variable `statusCode` is assigned `context.Response.StatusCode` immediately after `await _next(context)` returns and before the `AuditEntry` is constructed, so the value is captured before any further awaits.

**Explanation:** The `AuditEntry` object literal looks like it evaluates all its properties at once, but the compiler evaluates each property assignment in sequence. If `_auditChannel.WriteAsync` had been called before `StatusCode` was assigned that would not matter, but the concern is that the object initializer itself executes synchronously — however, the second await occurs right after, and in the presence of channel back-pressure the whole method suspends at `await _auditChannel.WriteAsync`. If ASP.NET Core recycles the context while that await is in flight, any deferred read of `context.Response.StatusCode` would see a stale or default value. Reading `StatusCode` into a local right after `_next` completes is cheap and deterministic regardless of channel latency.

---

### Issue 3: WriteAsync Called Without CancellationToken

**Problem:** `_auditChannel.WriteAsync(entry)` is called with no cancellation token. If the channel's consumer is slow or has stopped, the write blocks indefinitely. When the host shuts down or the request's connection drops, there is nothing to unblock the write, which can exhaust the thread pool under sustained load or leave tasks unobserved.

**Fix:** `context.RequestAborted` is passed as the second argument to `_auditChannel.WriteAsync(entry, context.RequestAborted)`, linking the write's lifetime to the request.

**Explanation:** `ChannelWriter<T>.WriteAsync` accepts a `CancellationToken` that it honours when the channel's internal buffer is full and the call is waiting for space. Without a token, a back-pressured write will wait until either the consumer catches up or the process exits. Passing `context.RequestAborted` means the write is cancelled if the client disconnects or the server begins shutdown, which allows the async state machine to complete and the `HttpContext` to be released promptly. A related pitfall: if you want audit entries to survive a client disconnect (fire-and-forget semantics), pass `CancellationToken.None` deliberately and add a `try/catch OperationCanceledException` around the write so shutdown is still handled gracefully.
