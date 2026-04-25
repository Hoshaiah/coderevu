---
slug: cancellation-throws-swallowed-in-catch
track: csharp
orderIndex: 83
title: OperationCanceledException Swallowed in Catch
difficulty: hard
tags:
  - cancellation
  - async
  - error-handling
language: csharp
---

## Context

This is in `Workers/DataSyncWorker.cs`, a hosted background service (`IHostedService`) in an ASP.NET Core 8 app. The worker pulls records from an upstream REST API in pages and writes them to a local database. It receives the host's `stoppingToken` so it can shut down cleanly when the application stops.

During a rolling deployment, operators observe that the app takes 90 seconds to shut down (the `SIGTERM` grace period) instead of the expected few seconds. Docker logs show the worker is still running long after the shutdown signal is sent. Kubernetes marks the pod as `Terminating` but it doesn't exit until the hard kill timeout.

The team confirmed that `stoppingToken` is being passed into the method. They added a log line at the top of the loop and saw it keeps printing even after `stoppingToken.IsCancellationRequested` is `true`. The upstream API client itself honours the token correctly.

## Buggy code

```csharp
public class DataSyncWorker : BackgroundService
{
    private readonly IApiClient _api;
    private readonly IDataRepository _repo;
    private readonly ILogger<DataSyncWorker> _logger;

    public DataSyncWorker(IApiClient api, IDataRepository repo, ILogger<DataSyncWorker> logger)
    {
        _api = api;
        _repo = repo;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var page = 0;
                List<Record> batch;
                do
                {
                    batch = await _api.GetPageAsync(page++, stoppingToken);
                    await _repo.UpsertBatchAsync(batch, stoppingToken);
                } while (batch.Count > 0);

                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Sync error, retrying after delay");
                await Task.Delay(TimeSpan.FromSeconds(5));
            }
        }
    }
}
```
