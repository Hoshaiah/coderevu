---
slug: linq-deferred-execution-side-effect
track: csharp
orderIndex: 55
title: LINQ Deferred Execution Mutates Twice
difficulty: medium
tags:
  - linq
  - deferred-execution
  - correctness
language: csharp
---

## Context

This code lives in `Services/OrderProcessor.cs`. It processes a batch of incoming orders: it applies a discount to qualifying orders, logs the adjusted totals, then persists them via the repository. The project targets .NET 6 and uses Entity Framework Core, but the bug is in the in-memory processing step before any EF call.

Operators notice that a small fraction of orders are persisted with a double-discounted total. The issue is non-deterministic in production but reliably reproducible in a specific integration test that applies a 10% discount to a list of five orders and checks that each is saved exactly once with the discounted amount.

The team has verified that the repository's `SaveAllAsync` method is correct and inserts each order exactly once. They also confirmed the input `orders` list arrives with the correct original totals.

## Buggy code

```csharp
public class OrderProcessor
{
    private readonly IOrderRepository _repo;
    private readonly ILogger<OrderProcessor> _logger;

    public OrderProcessor(IOrderRepository repo, ILogger<OrderProcessor> logger)
    {
        _repo = repo;
        _logger = logger;
    }

    public async Task ProcessBatchAsync(IEnumerable<Order> orders, decimal discountRate)
    {
        var discounted = orders.Select(o =>
        {
            o.Total *= (1 - discountRate);
            return o;
        });

        foreach (var order in discounted)
        {
            _logger.LogInformation("Order {Id} adjusted to {Total}", order.Id, order.Total);
        }

        await _repo.SaveAllAsync(discounted);
    }
}
```
