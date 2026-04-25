## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — First() Throws on Empty Sequence
// ------------------------------------------------------------------------

public class PricingService
{
    private readonly IReadOnlyList<PricingTier> _tiers;

    public PricingService(IReadOnlyList<PricingTier> tiers)
    {
        _tiers = tiers;
    }

    public decimal GetPrice(Product product)
    {
        // CHANGE 1: Replace First() with FirstOrDefault() so that a missing tier returns null instead of throwing InvalidOperationException.
        // CHANGE 2: OrderBy(Rank) before FirstOrDefault ensures the lowest-rank tier is picked when multiple active tiers exist for the same category.
        var tier = _tiers
            .Where(t => t.CategoryId == product.CategoryId && t.IsActive)
            .OrderBy(t => t.Rank)
            .FirstOrDefault();

        // CHANGE 1: When no tier is found, fall back to the full list price (discount rate of zero) instead of dereferencing a null reference.
        if (tier == null)
        {
            return product.ListPrice;
        }

        return product.ListPrice * (1 - tier.DiscountRate);
    }
}
```

## Explanation

### Issue 1: `First()` Throws on Missing Tier

**Problem:** When a product belongs to a category that has no active pricing tier configured, `First()` finds an empty sequence and throws `InvalidOperationException: Sequence contains no elements`. This exception is unhandled at the service boundary and propagates to the storefront as a 500 error. Customer support sees this whenever a new category is added before an admin configures its pricing tier.

**Fix:** Replace `First()` with `FirstOrDefault()` (CHANGE 1) so the query returns `null` instead of throwing. Add an explicit `null` check after the query (also CHANGE 1): when `tier` is `null`, return `product.ListPrice` directly, applying a zero discount.

**Explanation:** `First()` is a terminal LINQ operator that demands at least one element; it has no fallback path. `FirstOrDefault()` is the equivalent operator that returns the type's default value (`null` for reference types) when the sequence is empty, so control flow continues normally. The `null` guard then routes the no-tier case to the list price, which matches the intended business rule. A related pitfall: if `PricingTier` were a value type (a `struct`), `FirstOrDefault()` would return a zeroed struct rather than `null`, so you would need a different sentinel check — keeping `PricingTier` a class avoids that ambiguity.

---

### Issue 2: Multiple Active Tiers Not Resolved Deterministically

**Problem:** If an admin accidentally configures two active tiers for the same category, `First()` (or `FirstOrDefault()`) without a preceding sort would return whichever tier the in-memory list happened to place first, which is non-deterministic and depends on load order. The team wants the lowest-rank tier to win.

**Fix:** Add `.OrderBy(t => t.Rank)` before `FirstOrDefault()` (CHANGE 2). Because LINQ's `OrderBy` is a stable sort and `FirstOrDefault()` takes the first element of the sorted sequence, this always picks the tier with the numerically smallest `Rank` value.

**Explanation:** `IReadOnlyList<PricingTier>` preserves insertion order from the database query at startup, but that order is not guaranteed to reflect `Rank`. Without `OrderBy`, two active tiers for the same category could swap positions after a cache reload, producing different prices for the same product on different server restarts. Sorting by `Rank` ascending and then taking the first element makes selection deterministic regardless of load order. If two tiers share the exact same `Rank` value the tie is broken by insertion order, which is acceptable — but worth documenting as an admin data-quality constraint if strict determinism is required.
