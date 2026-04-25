---
slug: disposal-cancellation-token-registration-scope
track: csharp
orderIndex: 39
title: CancellationToken Registration Never Disposed
difficulty: hard
tags:
  - disposal
  - cancellation
  - memory-leak
language: csharp
---

## Context

This code is in `Infrastructure/LongPollingListener.cs`, a component in a real-time notification service. It wraps a vendor SDK's callback-based subscription API in a `Task`-returning method so the rest of the system can `await` it with cancellation support. The listener is created and torn down frequently — once per client connection on a WebSocket endpoint that handles thousands of concurrent users.

After several hours of load, the process memory grows steadily and never returns to baseline even after traffic drops. A memory dump shows thousands of `CancellationTokenRegistration` objects rooted by the `CancellationToken` internals. CPU is normal. GC pressure is high. There are no error logs.

The team identified that registrations are being created but suspected the vendor SDK's callback was holding references. A heap diff between two snapshots showed the registrations themselves are the leak — not SDK objects.

## Buggy code

```csharp
public class LongPollingListener
{
    private readonly IVendorSubscription _subscription;

    public LongPollingListener(IVendorSubscription subscription)
    {
        _subscription = subscription;
    }

    public Task<Message> WaitForMessageAsync(CancellationToken cancellationToken)
    {
        var tcs = new TaskCompletionSource<Message>(TaskCreationOptions.RunContinuationsAsynchronously);

        _subscription.OnMessageReceived(msg =>
        {
            tcs.TrySetResult(msg);
        });

        cancellationToken.Register(() =>
        {
            tcs.TrySetCanceled(cancellationToken);
        });

        return tcs.Task;
    }
}
```
