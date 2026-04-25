---
slug: disposal-cancellation-registration-leak
track: csharp
orderIndex: 29
title: CancellationToken Registration Never Disposed
difficulty: medium
tags:
  - disposal
  - cancellation
  - resource-management
language: csharp
---

## Context

This code lives in `SocketListener.cs`, a long-running TCP server component used in a financial data feed aggregator. Each inbound connection gets a `ConnectionHandler` instance that loops reading frames until the connection closes or the server shuts down. Connections can live anywhere from a few seconds to many hours.

After running for several days in a load test, memory grows unboundedly even though connections are closed and handlers are finalized. A memory snapshot shows thousands of `CancellationTokenRegistration` objects rooted via the `CancellationTokenSource` passed to each handler, even after those handlers have long finished.

The team confirmed there is no leak of the `ConnectionHandler` objects themselves — they are collected correctly. The leak is specifically the registrations hanging off the application-lifetime `CancellationTokenSource`.

## Buggy code

```csharp
public class ConnectionHandler
{
    private readonly Socket _socket;
    private readonly CancellationToken _shutdownToken;

    public ConnectionHandler(Socket socket, CancellationToken shutdownToken)
    {
        _socket = socket;
        _shutdownToken = shutdownToken;
    }

    public async Task RunAsync()
    {
        _shutdownToken.Register(() =>
        {
            _socket.Close();
        });

        var buffer = new byte[4096];
        try
        {
            while (true)
            {
                int read = await _socket.ReceiveAsync(buffer, SocketFlags.None);
                if (read == 0) break;
                await ProcessFrameAsync(buffer, read);
            }
        }
        catch (SocketException) { /* connection reset */ }
    }

    private Task ProcessFrameAsync(byte[] buffer, int length) =>
        Task.CompletedTask;
}
```
