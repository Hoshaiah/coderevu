---
slug: async-httpcontext-captured-after-await
track: csharp
orderIndex: 19
title: HttpContext Captured After Await Resumes
difficulty: hard
tags:
  - async
  - disposal
  - asp-net-core
language: csharp
---

## Context

This middleware is in `Middleware/RequestAuditMiddleware.cs` and is responsible for logging the user's IP address and request path after the rest of the pipeline has processed the request. It was added to comply with an audit logging requirement and has been deployed for several months.

Sporadically — maybe one in a thousand requests — the audit log contains `null` for the IP address, or the process throws `ObjectDisposedException: IFeatureCollection has been disposed` deep in the ASP.NET Core internals. The errors correlate with high concurrency and appear exclusively on endpoints that perform slow downstream HTTP calls.

The team added null-coalescing for the IP field which stopped the null entries but not the `ObjectDisposedException`. A senior engineer suspects the problem is related to timing around connection teardown, but the exact mechanism hasn't been identified.

## Buggy code

```csharp
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
        var path = context.Request.Path.Value;

        await _next(context);

        // Runs after the downstream pipeline completes.
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var userId = context.User.FindFirst("sub")?.Value;
        var statusCode = context.Response.StatusCode;

        await _audit.LogAsync(new AuditEntry
        {
            Path = path,
            IpAddress = ip,
            UserId = userId,
            StatusCode = statusCode,
            Timestamp = DateTime.UtcNow
        });
    }
}
```
