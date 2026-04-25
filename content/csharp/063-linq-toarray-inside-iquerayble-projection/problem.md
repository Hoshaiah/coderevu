---
slug: linq-toarray-inside-iquerayble-projection
track: csharp
orderIndex: 63
title: ToArray Call Forces Client Evaluation
difficulty: medium
tags:
  - linq
  - ef-core
  - performance
  - query
language: csharp
---

## Context

This query method is in `Reporting/SalesReportService.cs` and runs nightly to build a per-region sales summary. It uses Entity Framework Core against a PostgreSQL database with hundreds of thousands of order rows. The method is called from a `BackgroundService` and its results are written to a Redis cache for the dashboard.

After a data migration that tripled the number of orders, the nightly job started timing out and the application server's memory usage spiked to several gigabytes during the run. Database CPU stays low, but the app server CPU pegs at 100%. The query itself is fast when run directly in `psql`.

A junior developer added the `ToArray()` call inside the projection a few months ago to "help with serialization". The team has not connected that change to the current performance regression.

## Buggy code

```csharp
public async Task<List<RegionSummary>> GetSalesSummaryAsync(DateTime from, DateTime to)
{
    return await _db.Orders
        .Where(o => o.PlacedAt >= from && o.PlacedAt < to)
        .GroupBy(o => o.Region)
        .Select(g => new RegionSummary
        {
            Region = g.Key,
            TotalOrders = g.Count(),
            TotalRevenue = g.Sum(o => o.AmountCents),
            TopSkus = g.Select(o => o.Sku)
                       .Distinct()
                       .OrderBy(s => s)
                       .ToArray()          // <-- added for serialization
        })
        .ToListAsync();
}
```
