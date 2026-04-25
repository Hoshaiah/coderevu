## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — ToList Materializes Inside Hot Loop
// ------------------------------------------------------------------------

public class PricingEngine
{
    public IReadOnlyList<ProductPricing> ComputeDiscounts(
        IReadOnlyList<Product> catalog,
        IReadOnlyList<MarketPrice> marketPrices)
    {
        // CHANGE 1: Build a lookup grouped by SKU once before the loop so each product lookup is O(1) instead of O(m) with a new List allocation every iteration.
        var pricesBySku = marketPrices
            .GroupBy(p => p.Sku)
            .ToDictionary(g => g.Key, g => g.ToList());

        var results = new List<ProductPricing>(catalog.Count);

        foreach (var product in catalog)
        {
            bool eligible = IsEligibleForDiscount(product, pricesBySku);
            results.Add(new ProductPricing(product.Id, eligible));
        }

        return results;
    }

    // CHANGE 2: Accept a pre-built dictionary instead of the raw list so no filtering or ToList() allocation happens per product.
    private bool IsEligibleForDiscount(
        Product product,
        Dictionary<string, List<MarketPrice>> pricesBySku)
    {
        // CHANGE 1: Replace the per-call Where(...).ToList() with a single dictionary lookup; the filtered list was already materialized once above.
        if (!pricesBySku.TryGetValue(product.Sku, out var competitorPrices))
            return false;

        double avgCompetitor = competitorPrices.Average(p => p.Price);
        return product.ListPrice > avgCompetitor * 0.95;
    }
}
```

## Explanation

### Issue 1: `ToList()` Materialized Inside Hot Loop

**Problem:** For every product in the catalog, `IsEligibleForDiscount` calls `marketPrices.Where(p => p.Sku == product.Sku).ToList()`, which allocates a brand-new `List<MarketPrice>` and copies matching entries into it. With 80,000 products this produces 80,000 separate list allocations and 80,000 full scans of the market-prices collection, which is why the CPU profiler shows virtually all time in LINQ enumerator allocation and list construction.

**Fix:** Remove `ToList()` (and the preceding `Where`) from `IsEligibleForDiscount` entirely. Before the loop, call `marketPrices.GroupBy(p => p.Sku).ToDictionary(...)` once to build a `Dictionary<string, List<MarketPrice>>` keyed by SKU. Pass that dictionary into the helper method and use `TryGetValue` for each product lookup.

**Explanation:** `ToList()` forces immediate evaluation of the lazy `Where` enumerable and copies results into a new heap-allocated list. Placed inside a method that is called once per catalog item, it runs that full scan and allocation on every iteration. Moving the single `ToDictionary` call outside the loop means the filtering work happens exactly once regardless of catalog size. The dictionary gives O(1) average-case lookup per product, so the total work for the loop body drops from O(catalog × marketPrices) to O(catalog). A related pitfall: if you had kept `Where` without `ToList()`, the lazy enumerable would still scan the full market-prices list on every call — just without the extra allocation — so removing `ToList()` alone is not sufficient; replacing the scan with a dictionary lookup is the key change.

---

### Issue 2: O(n×m) Linear Scan Per Product

**Problem:** Even setting aside allocations, the original code performs a full linear scan of `marketPrices` for every product. With 80,000 products and, say, 50,000 market-price rows, that is 4 billion comparisons per pricing run. The operator sees the service consistently missing its scheduling window and building a backlog because each run takes 40+ seconds.

**Fix:** Replace the per-product `Where` scan with a single `GroupBy(...).ToDictionary(...)` before the loop (the `CHANGE 1` site), then replace the `Where(...).ToList()` call in `IsEligibleForDiscount` with `pricesBySku.TryGetValue(product.Sku, out var competitorPrices)` (the `CHANGE 2` site).

**Explanation:** The root cause is that a `List<T>` has no index on `Sku`, so every lookup requires touching every element. A `Dictionary` built with `GroupBy` hashes each SKU once during construction and then answers each `TryGetValue` in O(1) average time. The total work becomes O(marketPrices) to build the dictionary plus O(catalog) for the loop, instead of O(catalog × marketPrices). One pitfall to keep in mind: if `Sku` comparisons are case-sensitive by default but your data has mixed casing, pass `StringComparer.OrdinalIgnoreCase` to the `ToDictionary` call to avoid missed lookups that would silently return `false` for eligible products.
