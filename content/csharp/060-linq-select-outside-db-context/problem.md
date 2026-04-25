---
slug: linq-select-outside-db-context
track: csharp
orderIndex: 60
title: LINQ Projection Evaluated After Dispose
difficulty: medium
tags:
  - linq
  - disposal
  - ef-core
language: csharp
---

## Context

This code is in `Services/ReportService.cs` of a .NET 6 background job that generates daily sales reports. `GetOrderSummariesAsync` opens a scoped `DbContext`, runs a query, and returns a projected `IEnumerable<OrderSummary>` to the caller. The method is called from a long-running `IHostedService`.

The job crashes every night with `ObjectDisposedException: Cannot access a disposed context instance` originating deep inside LINQ's iterator machinery, not at the call site. The stack trace points to an `OrderSummary` property getter rather than the query itself, which confuses the team.

The developer confirmed the `using` block is correct and the `DbContext` is disposed at the right time. They assumed calling `.Select()` was safe because "the query already ran".

## Buggy code

```csharp
public class ReportService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public ReportService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public IEnumerable<OrderSummary> GetOrderSummaries(DateTime date)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        return db.Orders
            .Where(o => o.CreatedAt.Date == date.Date)
            .Select(o => new OrderSummary
            {
                Id = o.Id,
                Total = o.Total,
                CustomerName = o.Customer.Name
            });
    }
}
```
