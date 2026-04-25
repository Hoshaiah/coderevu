---
slug: ef-select-n-plus-one
track: csharp
orderIndex: 97
title: Lazy navigation property access inside a loop issues N+1 database queries
difficulty: medium
tags:
  - performance
  - entity-framework
  - n-plus-one
  - orm
language: csharp
---

## Context

An order management API has an endpoint that generates a daily dispatch report. For small customers it runs in milliseconds. One large customer with 3 000 orders in a single day causes the endpoint to time out after 30 seconds. SQL profiling shows thousands of individual `SELECT` statements being issued — one for each order.

## Buggy code

```csharp
public class DispatchReportService
{
    private readonly AppDbContext _db;

    public DispatchReportService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<DispatchLine>> GetReportAsync(DateTime date)
    {
        var orders = await _db.Orders
            .Where(o => o.PlacedAt.Date == date.Date)
            .ToListAsync();

        var lines = new List<DispatchLine>();
        foreach (var order in orders)
        {
            // Accessing .Customer triggers a lazy-load query per order
            lines.Add(new DispatchLine(
                order.Id,
                order.Customer.Name,
                order.Customer.ShippingAddress,
                order.TotalAmount
            ));
        }

        return lines;
    }
}
```
