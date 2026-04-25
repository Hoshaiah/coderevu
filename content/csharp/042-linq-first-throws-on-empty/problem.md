---
slug: linq-first-throws-on-empty
track: csharp
orderIndex: 42
title: First() Throws on Empty Sequence
difficulty: easy
tags:
  - linq
  - correctness
  - error-handling
language: csharp
---

## Context

This logic is in `Services/PricingService.cs` in an e-commerce backend. When a product is requested, the service looks up the active pricing tier for the product's category and applies it. Pricing tiers are loaded from a database table and cached in memory at startup.

Customer support reports intermittent `InvalidOperationException: Sequence contains no elements` stack traces originating from `PricingService`. The error correlates with newly-added product categories where pricing tiers haven't been configured yet in the admin panel. The exception bubbles all the way up and returns a 500 to the storefront.

The team wants the service to fall back to the default list price when no tier is configured, rather than throwing. They also want to handle the case where multiple active tiers exist for the same category (it should pick the one with the lowest tier rank).

## Buggy code

```csharp
public class PricingService
{
    private readonly IReadOnlyList<PricingTier> _tiers;

    public PricingService(IReadOnlyList<PricingTier> tiers)
    {
        _tiers = tiers;
    }

    public decimal GetPrice(Product product)
    {
        var tier = _tiers
            .Where(t => t.CategoryId == product.CategoryId && t.IsActive)
            .OrderBy(t => t.Rank)
            .First();

        return product.ListPrice * (1 - tier.DiscountRate);
    }
}
```
