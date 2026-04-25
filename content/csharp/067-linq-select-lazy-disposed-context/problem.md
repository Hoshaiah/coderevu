---
slug: linq-select-lazy-disposed-context
track: csharp
orderIndex: 67
title: IQueryable Enumerated After Context Disposed
difficulty: medium
tags:
  - linq
  - disposal
  - entity-framework
language: csharp
---

## Context

`Repositories/OrderRepository.cs` exposes a method that returns a projected sequence of order summaries. The calling code in `Services/ReportingService.cs` chains additional LINQ operators on top of the returned value before iterating it. Entity Framework Core's `DbContext` is registered as `Scoped` in the DI container.

The app throws `ObjectDisposedException: Cannot access a disposed context instance` intermittently in production, always from within `ReportingService`. The stack trace points to LINQ materialization code deep inside EF. The same repository method works fine when called from controllers that iterate the result in the same scope.

The team verified the DI scope lifetime is correct everywhere else and added `.AsNoTracking()` thinking that would help — it did not.

## Buggy code

```csharp
// OrderRepository.cs
public IQueryable<OrderSummary> GetRecentSummaries(DateTime since)
{
    return _context.Orders
        .Where(o => o.CreatedAt >= since)
        .Select(o => new OrderSummary
        {
            Id = o.Id,
            CustomerName = o.Customer.Name,
            Total = o.LineItems.Sum(l => l.Quantity * l.UnitPrice)
        });
}

// ReportingService.cs
public async Task<List<OrderSummary>> GetTopOrdersAsync(DateTime since, int count)
{
    using var scope = _serviceScopeFactory.CreateScope();
    var repo = scope.ServiceProvider.GetRequiredService<OrderRepository>();

    var query = repo.GetRecentSummaries(since);

    // scope (and its DbContext) is disposed here — query not yet executed
    return query
        .OrderByDescending(s => s.Total)
        .Take(count)
        .ToList();
}
```
