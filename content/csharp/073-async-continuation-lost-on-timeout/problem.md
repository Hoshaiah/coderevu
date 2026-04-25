---
slug: async-continuation-lost-on-timeout
track: csharp
orderIndex: 73
title: CancellationTokenSource Disposed Before Callback
difficulty: easy
tags:
  - cancellation
  - async
  - disposal
language: csharp
---

## Context

This code lives in `Services/OrderProcessor.cs` in an ASP.NET Core order-processing service. Each incoming HTTP request calls `ProcessOrderAsync`, which calls a downstream inventory API with a per-request timeout enforced by a `CancellationTokenSource`. The service handles roughly 500 requests per minute at peak.

Operators see sporadic `ObjectDisposedException: The CancellationTokenSource has been disposed` stack traces in the application logs, always originating from inside `HttpClient.SendAsync`. The errors appear only under moderate-to-high load and never in integration tests, which run one request at a time.

The team already confirmed the `HttpClient` instance is long-lived and correctly registered as a singleton. They also confirmed the downstream service is healthy and responding well within the timeout window.

## Buggy code

```csharp
public class OrderProcessor
{
    private readonly HttpClient _http;
    private readonly ILogger<OrderProcessor> _log;

    public OrderProcessor(HttpClient http, ILogger<OrderProcessor> log)
    {
        _http = http;
        _log = log;
    }

    public async Task<OrderResult> ProcessOrderAsync(Order order, CancellationToken requestToken)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(requestToken);
        cts.CancelAfter(TimeSpan.FromSeconds(5));

        var response = await _http.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/inventory/reserve")
            {
                Content = JsonContent.Create(order)
            },
            cts.Token);

        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<OrderResult>(cts.Token);
        return result!;
    }
}
```
