---
slug: async-timeout-cts-ignored
track: csharp
orderIndex: 5
title: Timeout CancellationToken Never Observed
difficulty: easy
tags:
  - async
  - cancellation
  - timeout
language: csharp
---

## Context

This helper lives in `Services/HttpPollingService.cs` inside a .NET 6 background worker that polls a third-party REST endpoint every 30 seconds. The `FetchWithTimeoutAsync` method is called from a `PeriodicTimer` loop and is supposed to abort the HTTP call if the remote server doesn't respond within 5 seconds.

Operators notice that the service occasionally hangs for 60-90 seconds during network blips instead of failing fast. The `TaskCanceledException` they expected to see in the logs never appears. Throughput drops to zero during these periods and the watchdog eventually kills the process.

The developer added `using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5))` thinking that was all that was needed. The `HttpClient` timeout is set to `Timeout.InfiniteTimeSpan` intentionally so that per-request CTS tokens control each call independently.

## Buggy code

```csharp
public class HttpPollingService
{
    private readonly HttpClient _client;
    private readonly ILogger<HttpPollingService> _logger;

    public HttpPollingService(HttpClient client, ILogger<HttpPollingService> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task<string> FetchWithTimeoutAsync(string url)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var request = new HttpRequestMessage(HttpMethod.Get, url);
        var response = await _client.SendAsync(request);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadAsStringAsync();
    }
}
```
