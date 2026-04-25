---
slug: disposal-cts-in-using-cancels-early
track: csharp
orderIndex: 31
title: CancellationTokenSource Disposed Before Task Completes
difficulty: medium
tags:
  - disposal
  - cancellation
  - async
language: csharp
---

## Context

This code is in `Jobs/DataIngestionJob.cs`, part of a nightly ETL pipeline that pulls records from a third-party API and writes them to a SQL Server database. The job is triggered by a Quartz.NET scheduler and is expected to run for 2–15 minutes depending on record volume. The `CancellationTokenSource` is used to enforce a 20-minute timeout.

About 30% of nightly runs throw `ObjectDisposedException: The CancellationTokenSource has been disposed` partway through the write loop. The stack trace always points to code inside `_db.SaveChangesAsync`. The failure rate increases when record volumes are high. Quartz logs show the trigger fired correctly and no external cancellation was requested.

The team verified the database connection is healthy and that `SaveChangesAsync` is not the root cause — the exception message consistently references the `CancellationTokenSource`, not the `DbContext`.

## Buggy code

```csharp
public class DataIngestionJob : IJob
{
    private readonly IApiClient _api;
    private readonly AppDbContext _db;
    private readonly ILogger<DataIngestionJob> _logger;

    public DataIngestionJob(IApiClient api, AppDbContext db, ILogger<DataIngestionJob> logger)
    {
        _api = api;
        _db = db;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(20));
        var token = cts.Token;

        var records = await _api.FetchAllAsync(token);
        _logger.LogInformation("Fetched {Count} records.", records.Count);

        foreach (var record in records)
        {
            _db.Records.Add(record);
        }

        await using (cts)
        {
            await _db.SaveChangesAsync(token);
        }

        _logger.LogInformation("Ingestion complete.");
    }
}
```
