---
slug: async-semaphore-not-released-on-exception
track: csharp
orderIndex: 12
title: SemaphoreSlim Leaked on Async Exception
difficulty: medium
tags:
  - async
  - concurrency
  - resource-management
language: csharp
---

## Context

This class lives in `Services/ExternalApiGateway.cs`. The gateway enforces a maximum of 10 concurrent outbound calls to a rate-limited third-party API. A `SemaphoreSlim` with initial count 10 is used to limit concurrency. The class is registered as a singleton and is called from multiple ASP.NET Core request handlers simultaneously.

After the service runs under sustained load for about an hour, all new requests start hanging indefinitely. Metrics show `SemaphoreSlim.CurrentCount` eventually reaches 0 even though only a handful of requests are active. Restarting the service restores normal operation. The issue does not reproduce in integration tests because those tests mock the downstream HTTP call and never throw.

The team added logging inside the method and confirmed that some requests to the downstream API throw `HttpRequestException` for transient errors. Those exceptions are caught and handled by the caller, so they do not propagate further, which is why the service appears healthy from the outside.

## Buggy code

```csharp
public class ExternalApiGateway
{
    private readonly HttpClient _http;
    private readonly SemaphoreSlim _sem = new SemaphoreSlim(10, 10);

    public ExternalApiGateway(HttpClient http)
    {
        _http = http;
    }

    public async Task<ApiResult> CallAsync(ApiRequest request, CancellationToken ct)
    {
        await _sem.WaitAsync(ct);

        var response = await _http.SendAsync(
            new HttpRequestMessage(HttpMethod.Post, "/api/process")
            {
                Content = JsonContent.Create(request)
            }, ct);

        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<ApiResult>(ct);

        _sem.Release();
        return result!;
    }
}
```
