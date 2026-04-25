---
slug: disposable-httpclient-exhaustion
track: csharp
orderIndex: 99
title: Creating a new HttpClient per request exhausts socket connections under load
difficulty: easy
tags:
  - resource-management
  - http
  - sockets
  - disposal
language: csharp
---

## Context

A microservice calls a downstream pricing API on every incoming request. In staging it works fine, but in production under moderate load the service starts throwing `SocketException: Only one usage of each socket address is normally permitted` and response times spike. Restarting the service temporarily fixes it.

## Buggy code

```csharp
public class PricingService
{
    private readonly string _baseUrl;

    public PricingService(string baseUrl)
    {
        _baseUrl = baseUrl;
    }

    public async Task<decimal> GetPriceAsync(string sku)
    {
        using var client = new HttpClient();
        client.BaseAddress = new Uri(_baseUrl);
        client.DefaultRequestHeaders.Add("Accept", "application/json");

        var response = await client.GetAsync($"/prices/{sku}");
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<PriceResponse>(json).Amount;
    }
}
```
