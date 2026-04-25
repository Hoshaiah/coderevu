---
slug: cancellation-register-callback-throws
track: csharp
orderIndex: 81
title: CancellationToken Callback Swallows Exception
difficulty: medium
tags:
  - cancellation
  - exceptions
  - async
language: csharp
---

## Context

This code lives in `Infrastructure/DatabaseSession.cs` in a .NET 7 microservice that manages long-running database sessions. The constructor registers a cancellation callback to close the session cleanly when the service shuts down. The pattern is used across several session-wrapper classes.

During integration tests that simulate graceful shutdown, the test harness occasionally hangs indefinitely. Application logs show "Cancellation requested" but never show "Session closed" or any error. The `IHostedService.StopAsync` call that triggers the `CancellationToken` never completes within its 5-second timeout.

The team traced the hang to the `CancellationToken.Register` callback but couldn't figure out why — the callback body looked correct to them.

## Buggy code

```csharp
public class DatabaseSession : IDisposable
{
    private readonly IDbConnection _connection;
    private readonly ILogger<DatabaseSession> _logger;
    private readonly CancellationTokenRegistration _registration;
    private bool _disposed;

    public DatabaseSession(
        IDbConnection connection,
        ILogger<DatabaseSession> logger,
        CancellationToken shutdownToken)
    {
        _connection = connection;
        _logger = logger;

        _registration = shutdownToken.Register(() =>
        {
            _logger.LogInformation("Cancellation requested, closing session.");
            _connection.Close();
            _logger.LogInformation("Session closed.");
        });
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _registration.Dispose();
        _connection.Dispose();
    }
}
```
