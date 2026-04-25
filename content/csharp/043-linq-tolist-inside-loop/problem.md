---
slug: linq-tolist-inside-loop
track: csharp
orderIndex: 43
title: ToList Materializes Inside Hot Loop
difficulty: easy
tags:
  - linq
  - performance
  - enumerable
language: csharp
---

## Context

This code lives in `PricingEngine.cs`, the core of an e-commerce repricing service that runs every few minutes to adjust prices across a product catalog. The method accepts a list of current market prices and a master product list, then computes a discount eligibility flag for each product.

At small catalog sizes (< 1 000 products) the method runs in under 100 ms. After a catalog migration that brought the total to 80 000 products, the same method takes 40+ seconds per run, making it miss its scheduling window and causing a backlog. CPU profiles show virtually all time is spent in LINQ enumerator allocation and list construction inside the inner method.

The developer who wrote this was aware that `Where` is lazy and deliberately added `ToList()` thinking it would "cache" the filter result for reuse, but misunderstood where to put it.

## Buggy code

```csharp
public class PricingEngine
{
    public IReadOnlyList<ProductPricing> ComputeDiscounts(
        IReadOnlyList<Product> catalog,
        IReadOnlyList<MarketPrice> marketPrices)
    {
        var results = new List<ProductPricing>(catalog.Count);

        foreach (var product in catalog)
        {
            bool eligible = IsEligibleForDiscount(product, marketPrices);
            results.Add(new ProductPricing(product.Id, eligible));
        }

        return results;
    }

    private bool IsEligibleForDiscount(
        Product product,
        IReadOnlyList<MarketPrice> marketPrices)
    {
        var competitorPrices = marketPrices
            .Where(p => p.Sku == product.Sku)
            .ToList();

        if (!competitorPrices.Any()) return false;

        double avgCompetitor = competitorPrices.Average(p => p.Price);
        return product.ListPrice > avgCompetitor * 0.95;
    }
}
```
