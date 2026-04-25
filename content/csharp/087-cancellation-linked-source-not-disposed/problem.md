---
slug: cancellation-linked-source-not-disposed
track: csharp
orderIndex: 87
title: Linked CTS Leaks on Every Request
difficulty: hard
tags:
  - cancellation
  - disposal
  - resource-management
language: csharp
---

## Context

This middleware lives in `Middleware/RequestTimeoutMiddleware.cs` in a high-throughput ASP.NET Core 7 API. It creates a per-request timeout by linking the incoming `HttpContext.RequestAborted` token with a freshly created timed token. It was written to ensure requests exceeding 10 seconds are aborted regardless of whether the client disconnects.

After deploying this middleware, memory grows steadily at roughly 2 KB per request and never stabilises. A memory dump shows thousands of `CancellationTokenSource` instances rooted by internal `CancellationTokenSource` callback lists. The API handles ~500 req/s, so memory exhaustion happens within hours on a 2 GB container.

Developers confirmed the timeout logic itself works correctly — requests do get cancelled after 10 seconds. The memory leak is the only problem.

## Buggy code

```csharp
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
        var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
            context.RequestAborted,
            timeoutCts.Token);

        context.RequestAborted = linkedCts.Token;

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
