---
slug: disposal-httpcontext-accessed-after-response
track: csharp
orderIndex: 40
title: HttpContext Accessed After Response Disposes
difficulty: hard
tags:
  - disposal
  - async
  - http
language: csharp
---

## Context

This code is in `Middleware/AuditLoggingMiddleware.cs`, a custom ASP.NET Core middleware that writes an audit record after each API response is sent. It reads the response status code and a custom response header set by downstream handlers, then writes the audit entry to a database. The middleware was added to track security-sensitive endpoints.

In production, audit records occasionally show incorrect status codes (always 200 regardless of the actual response) and missing header values. The issue correlates with high-traffic periods. Some audit writes also throw `ObjectDisposedException` referencing `IHttpResponseFeature`. The middleware works perfectly in integration tests that use `TestServer`.

The team confirmed the database write itself is correct — when the values are right, the record is written correctly. They added verbose logging and found that the feature reads succeed locally but intermittently fail in production under the async scheduling the real Kestrel server uses.

## Buggy code

```csharp
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

        // Response has been sent — capture audit info
        var statusCode = context.Response.StatusCode;
        var requestId = context.Response.Headers["X-Request-Id"].ToString();

        _ = Task.Run(async () =>
        {
            await _audit.WriteAsync(new AuditEntry
            {
                StatusCode = statusCode,
                RequestId = requestId,
                Timestamp = DateTimeOffset.UtcNow
            });
        });
    }
}
```
