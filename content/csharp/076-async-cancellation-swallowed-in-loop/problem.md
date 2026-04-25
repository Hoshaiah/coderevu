---
slug: async-cancellation-swallowed-in-loop
track: csharp
orderIndex: 76
title: CancellationException Swallowed in Retry Loop
difficulty: easy
tags:
  - cancellation
  - async
  - error-handling
language: csharp
---

## Context

This method lives in `Services/DataImportService.cs`, a background service that pulls records from a remote API and upserts them into a SQL database. It is invoked from a hosted `IHostedService` and receives a `CancellationToken` from the host's shutdown signal.

Operators notice that graceful shutdown sometimes hangs for 30+ seconds instead of stopping promptly. The process eventually terminates after the shutdown timeout, but the logs show the import loop still running through retries even after Ctrl+C is pressed. The host logs `Waiting for hosted services to stop...` indefinitely.

The team already confirmed the `CancellationToken` is wired up correctly at the `IHostedService` level. They also checked that `HttpClient` calls pass the token. The retry loop is the last place no one has looked.

## Buggy code

```csharp
public async Task ImportBatchAsync(IEnumerable<int> ids, CancellationToken ct)
{
    foreach (var id in ids)
    {
        int attempts = 0;
        while (true)
        {
            try
            {
                var record = await _apiClient.FetchAsync(id, ct);
                await _repository.UpsertAsync(record, ct);
                break;
            }
            catch (Exception ex)
            {
                attempts++;
                if (attempts >= 3)
                {
                    _logger.LogError(ex, "Giving up on id {Id} after 3 attempts", id);
                    break;
                }
                _logger.LogWarning(ex, "Retrying id {Id}, attempt {N}", id, attempts);
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }
        }
    }
}
```
