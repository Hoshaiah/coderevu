---
slug: disposal-semaphore-not-released-finally
track: csharp
orderIndex: 34
title: SemaphoreSlim Leaked on Exception Path
difficulty: medium
tags:
  - disposal
  - async
  - concurrency
  - resource-management
language: csharp
---

## Context

This class lives in `Services/ExternalApiGateway.cs` and wraps calls to a rate-limited third-party payment API. A `SemaphoreSlim` is used to enforce a maximum of 5 concurrent outbound requests as required by the payment provider's terms of service.

After running in production for a few weeks, the service gradually stops making any outbound API calls. Metrics show that `SemaphoreSlim.CurrentCount` drops to zero and never recovers. Restarting the service temporarily fixes the issue. The problem correlates with periods of elevated HTTP 429 (Too Many Requests) and 503 responses from the payment provider, which cause the inner HTTP calls to throw.

The team added a circuit breaker that correctly stops requests when the downstream is unhealthy, but the semaphore is already fully consumed by the time the circuit opens.

## Buggy code

```csharp
public class ExternalApiGateway
{
    private readonly HttpClient _http;
    private readonly SemaphoreSlim _concurrencyLimit = new SemaphoreSlim(5, 5);

    public ExternalApiGateway(HttpClient http)
    {
        _http = http;
    }

    public async Task<PaymentResponse> ChargeAsync(
        PaymentRequest request,
        CancellationToken cancellationToken)
    {
        await _concurrencyLimit.WaitAsync(cancellationToken);

        var json = JsonSerializer.Serialize(request);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _http.PostAsync("/charge", content, cancellationToken);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        _concurrencyLimit.Release();

        return JsonSerializer.Deserialize<PaymentResponse>(body)!;
    }
}
```
