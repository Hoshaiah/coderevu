---
slug: cancellation-timeout-not-cancelled-on-success
track: csharp
orderIndex: 75
title: Timeout CTS Abandoned After Success
difficulty: easy
tags:
  - cancellation
  - disposal
  - resource-management
  - async
language: csharp
---

## Context

This method is in `Http/ResilienceClient.cs`, a thin wrapper around `HttpClient` that enforces a per-request timeout. It creates a `CancellationTokenSource` with a deadline and links it to the caller's token. The method is called hundreds of times per second by a high-throughput API gateway.

After running for several hours under load, the process memory grows steadily and is eventually OOM-killed. A memory dump shows tens of thousands of `CancellationTokenSource` instances rooted in the thread-pool timer queue. CPU profiling shows a growing number of timer callbacks firing for requests that completed successfully long ago.

The team added `.CancelAfter()` to replace an older `CreateLinkedTokenSource` pattern as a simplification, but did not audit the disposal behavior of the new approach.

## Buggy code

```csharp
public async Task<HttpResponseMessage> SendWithTimeoutAsync(
    HttpRequestMessage request,
    TimeSpan timeout,
    CancellationToken ct)
{
    var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
    cts.CancelAfter(timeout);

    try
    {
        return await _http.SendAsync(request, cts.Token);
    }
    catch (OperationCanceledException) when (ct.IsCancellationRequested)
    {
        throw; // propagate caller cancellation
    }
    catch (OperationCanceledException)
    {
        throw new TimeoutException($"Request timed out after {timeout.TotalSeconds}s");
    }
}
```
