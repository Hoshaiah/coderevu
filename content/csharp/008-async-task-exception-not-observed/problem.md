---
slug: async-task-exception-not-observed
track: csharp
orderIndex: 8
title: Fire-and-Forget Task Exception Crashes Process
difficulty: easy
tags:
  - async
  - exceptions
  - task
language: csharp
---

## Context

`AuditLogger.cs` is a cross-cutting concern registered as a singleton in an ASP.NET Core API. It writes audit events to a secondary database asynchronously to avoid slowing down request processing. Because audit logging is considered non-critical, failures should be logged and swallowed rather than propagated to callers.

The production service crashes approximately once per hour with `TaskScheduler.UnobservedTaskException`. The crash always happens during a period of high load. `dotnet-dump` analysis shows the faulting task originated from `AuditDbContext.InsertAsync` throwing a `SqlException` when the secondary database is temporarily unreachable.

The team is confused because the method signature is `async Task`, not `async void`, and they believed `Task`-returning methods never caused unobserved exceptions. They also tried wrapping the call site in `try/catch` but it did not help because the exception happens after the `await` has already returned.

## Buggy code

```csharp
public class AuditLogger
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<AuditLogger> _logger;

    public AuditLogger(IServiceProvider sp, ILogger<AuditLogger> logger)
    {
        _sp = sp;
        _logger = logger;
    }

    // Non-blocking: caller does not await this.
    public void Log(AuditEvent evt)
    {
        // Intentionally fire-and-forget so the request thread is not blocked.
        WriteAsync(evt);
    }

    private async Task WriteAsync(AuditEvent evt)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
        await db.InsertAsync(evt);
    }
}
```
