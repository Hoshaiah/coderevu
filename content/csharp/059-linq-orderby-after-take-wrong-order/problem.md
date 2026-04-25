---
slug: linq-orderby-after-take-wrong-order
track: csharp
orderIndex: 59
title: OrderBy After Take Returns Wrong Subset
difficulty: medium
tags:
  - linq
  - correctness
  - query
language: csharp
---

## Context

This code is in `Reports/TopProductsQuery.cs`, a query class in an e-commerce back-office reporting dashboard. It returns the five best-selling products by units sold for a given time period. The results are displayed in a leaderboard widget on the dashboard home page.

Product managers report that the leaderboard frequently shows the wrong products — items that are not actually the top five sellers appear, and genuine top sellers are missing. The ordering within the displayed five looks correct, but the *selection* of which five products appear is wrong. The bug only shows up with more than five products in the dataset, which is always the case in production.

The developer who wrote the query tested it with exactly five products in a dev database where the result was coincidentally correct. Unit tests also used a five-element dataset.

## Buggy code

```csharp
public class TopProductsQuery
{
    private readonly StoreDbContext _db;

    public TopProductsQuery(StoreDbContext db)
    {
        _db = db;
    }

    public async Task<List<ProductSummary>> GetTopFiveAsync(
        DateTimeOffset from,
        DateTimeOffset to)
    {
        return await _db.OrderItems
            .Where(i => i.Order.PlacedAt >= from && i.Order.PlacedAt <= to)
            .GroupBy(i => i.ProductId)
            .Select(g => new ProductSummary
            {
                ProductId = g.Key,
                TotalUnitsSold = g.Sum(i => i.Quantity)
            })
            .Take(5)
            .OrderByDescending(p => p.TotalUnitsSold)
            .ToListAsync();
    }
}
```
