---
slug: cancellation-token-not-linked
track: csharp
orderIndex: 78
title: CancellationToken Not Linked to Timeout
difficulty: medium
tags:
  - cancellation
  - timeout
  - async
language: csharp
---

## Context

This code is in `Clients/PaymentGatewayClient.cs`, a thin wrapper around `HttpClient` used during checkout. Each request passes through a caller-supplied `CancellationToken` so the web framework can cancel in-flight requests when the user closes the browser. The client enforces a hard 5-second timeout per the payment gateway's SLA.

Support tickets show that some checkout requests hang for over 30 seconds before failing. Server metrics show the HTTP connection pool growing unbounded during traffic spikes. The app's global request timeout is 30 seconds, which is why hangs eventually end. The team expected the 5-second `CancellationTokenSource` timeout to fire first.

Investigation confirmed the issue happens when the caller's `CancellationToken` is already cancelled by the time the method is called, but it also happens when the gateway is simply slow — the 5-second timeout appears not to fire.

## Buggy code

```csharp
public class PaymentGatewayClient
{
    private readonly HttpClient _http;

    public PaymentGatewayClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<PaymentResult> ChargeAsync(
        ChargeRequest request,
        CancellationToken callerToken = default)
    {
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var json = JsonSerializer.Serialize(request);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _http.PostAsync("/charge", content, timeoutCts.Token);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync(timeoutCts.Token);
        return JsonSerializer.Deserialize<PaymentResult>(body)!;
    }
}
```
