---
slug: async-context-captured-wrong-scope
track: csharp
orderIndex: 21
title: HttpContext Captured Across Await Boundary
difficulty: hard
tags:
  - async
  - lifetime
  - aspnetcore
  - correctness
language: csharp
---

## Context

This code is in `Middleware/AuditMiddleware.cs`, an ASP.NET Core middleware that reads the request body for audit logging before passing the request downstream. It caches a reference to `HttpContext` in a local variable and then awaits a slow audit sink write. The audit sink is a `ChannelWriter<AuditEntry>` that occasionally applies back-pressure.

Under high concurrency, audit log entries sporadically contain the wrong `UserId` or a null `RemoteIpAddress`. Occasionally an `ObjectDisposedException` is thrown from inside the sink callback. The bug is intermittent and cannot be reproduced in integration tests because they run requests sequentially.

The team verified that the `IHttpContextAccessor` is scoped correctly and that `HttpContext.User` is populated before the middleware runs. The root cause is that a property of `HttpContext` is read after the context's lifetime has ended.

## Buggy code

```csharp
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

        await _next(context);

        // Log after the response is sent
        var entry = new AuditEntry
        {
            Path = path,
            Method = method,
            StatusCode = context.Response.StatusCode,
            UserId = context.User.FindFirstValue(ClaimTypes.NameIdentifier),
            RemoteIp = context.Connection.RemoteIpAddress?.ToString()
        };

        await _auditChannel.WriteAsync(entry);
    }
}
```
