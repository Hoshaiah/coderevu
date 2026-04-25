---
slug: cancellation-timeout-cts-not-cancelled
track: csharp
orderIndex: 91
title: Timeout CancellationToken Never Fires
difficulty: hard
tags:
  - cancellation
  - async
  - api-misuse
language: csharp
---

## Context

`ExternalSearchClient.cs` wraps an HTTP call to a third-party search API. Each request must time out within 2 seconds to respect the SLA. The client creates a `CancellationTokenSource` with a timeout and passes its token to `SendAsync`. It also accepts an outer `CancellationToken` from the caller so requests can be cancelled on user navigation.

Under load testing, requests to the external API that hang (simulated with `Task.Delay(30_000)`) take 30 seconds to return rather than 2. The `CancellationTokenSource` constructor overload `new CancellationTokenSource(timeout)` is present in the code. APM traces confirm no `TaskCanceledException` is thrown on slow requests; they simply wait for the full 30 seconds.

The team verified the `HttpClient` does not have its own `Timeout` set (it is `Timeout.InfiniteTimeSpan`), so the CTS timeout is the only mechanism. They added a log line in the `catch (OperationCanceledException)` block — it never fires during the 30-second hang. The code compiles without warnings.

## Buggy code

```csharp
public class ExternalSearchClient
{
    private readonly HttpClient _http;
    private readonly TimeSpan _timeout = TimeSpan.FromSeconds(2);

    public ExternalSearchClient(HttpClient http) => _http = http;

    public async Task<SearchResult> SearchAsync(
        string query,
        CancellationToken callerCt)
    {
        using var timeoutCts = new CancellationTokenSource(_timeout);
        using var linkedCts  = CancellationTokenSource.CreateLinkedTokenSource(
            callerCt, timeoutCts.Token);

        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get,
                $"/search?q={Uri.EscapeDataString(query)}");

            var response = await _http.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                callerCt); // <-- wrong token passed here

            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<SearchResult>(json)!;
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            throw new TimeoutException($"Search timed out after {_timeout.TotalSeconds}s.");
        }
    }
}
```
