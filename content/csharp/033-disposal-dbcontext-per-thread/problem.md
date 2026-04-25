---
slug: disposal-dbcontext-per-thread
track: csharp
orderIndex: 33
title: DbContext Shared Across Threads
difficulty: medium
tags:
  - disposal
  - linq
  - concurrency
  - entity-framework
language: csharp
---

## Context

This code is in `Workers/OrderSyncWorker.cs`, a `BackgroundService` that periodically pulls orders from a remote API and upserts them into a SQL Server database via Entity Framework Core. The worker was written to process batches in parallel to meet a throughput SLA.

The service intermittently throws `InvalidOperationException: A second operation was started on this context instance before a previous operation completed` and `ObjectDisposedException` from within the parallel tasks. These exceptions appear in bursts during high-volume syncs and are absent during low-traffic periods, which initially led the team to suspect a transient network issue.

The team added retry logic around the database calls, which reduced the frequency of errors but did not eliminate them. Code review confirmed that `_dbContext` is registered as a scoped service injected through the constructor.

## Buggy code

```csharp
public class OrderSyncWorker : BackgroundService
{
    private readonly IOrderApiClient _api;
    private readonly AppDbContext _dbContext;
    private readonly ILogger<OrderSyncWorker> _logger;

    public OrderSyncWorker(
        IOrderApiClient api,
        AppDbContext dbContext,
        ILogger<OrderSyncWorker> logger)
    {
        _api = api;
        _dbContext = dbContext;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var orders = await _api.FetchPendingAsync(stoppingToken);

            await Parallel.ForEachAsync(
                orders,
                stoppingToken,
                async (order, ct) =>
                {
                    var existing = await _dbContext.Orders
                        .FirstOrDefaultAsync(o => o.Id == order.Id, ct);

                    if (existing is null)
                        _dbContext.Orders.Add(new Order(order));
                    else
                        existing.UpdateFrom(order);

                    await _dbContext.SaveChangesAsync(ct);
                });

            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }
}
```
