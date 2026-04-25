---
slug: disposal-response-stream-abandoned
track: csharp
orderIndex: 30
title: HttpResponseMessage Disposal Abandons Stream
difficulty: medium
tags:
  - disposal
  - async
  - resource-management
language: csharp
---

## Context

This class lives in `Infrastructure/WeatherClient.cs` in a microservice that polls an external weather API every 30 seconds and caches the result. The service runs inside a Kubernetes pod with a memory limit of 256 MB. `HttpClient` is injected as a singleton via `IHttpClientFactory`.

After the service has been running for a few hours, the pod's memory climbs steadily from ~80 MB to the 256 MB limit, at which point the OOMKiller terminates it. Application metrics show the polling loop is healthy and responses arrive within 200 ms, but memory never decreases between polls. Restarting the pod brings memory back to baseline immediately.

The team already checked that the `HttpClient` is not being recreated on every poll. They added a GC.Collect() call in staging and confirmed that the memory *does* get freed — meaning live references are holding it. They suspect a finalizer path but can't find the root cause.

## Buggy code

```csharp
public class WeatherClient
{
    private readonly HttpClient _http;

    public WeatherClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<WeatherData> GetCurrentAsync(string stationId)
    {
        var response = await _http.GetAsync(
            $"/stations/{stationId}/current",
            HttpCompletionOption.ResponseHeadersRead);

        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync();
        var data = await JsonSerializer.DeserializeAsync<WeatherData>(stream);
        return data!;
    }
}
```
