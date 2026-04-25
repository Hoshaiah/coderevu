## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — ToArray Call Forces Client Evaluation
// ------------------------------------------------------------------------

public async Task<List<RegionSummary>> GetSalesSummaryAsync(DateTime from, DateTime to)
{
    // CHANGE 1: Remove ToArray() from inside the GroupBy projection so EF Core can translate the entire query to SQL without pulling all rows into app memory.
    // CHANGE 2: Replace the in-projection Distinct/OrderBy/ToArray subquery with a server-evaluated List<string> by fetching TopSkus in a separate, focused async query after the aggregate step.
    var summaries = await _db.Orders
        .Where(o => o.PlacedAt >= from && o.PlacedAt < to)
        .GroupBy(o => o.Region)
        .Select(g => new RegionSummary
        {
            Region = g.Key,
            TotalOrders = g.Count(),
            TotalRevenue = g.Sum(o => o.AmountCents),
            TopSkus = null   // CHANGE 1: placeholder; populated below to avoid client evaluation inside GroupBy
        })
        .ToListAsync();

    // CHANGE 2: Fetch distinct SKUs per region in a single server-side query and join in memory (small result set — one string per unique SKU per region).
    var skusByRegion = await _db.Orders
        .Where(o => o.PlacedAt >= from && o.PlacedAt < to)
        .Select(o => new { o.Region, o.Sku })
        .Distinct()
        .GroupBy(x => x.Region)
        .Select(g => new { Region = g.Key, Skus = g.Select(x => x.Sku).OrderBy(s => s).ToList() })
        .ToDictionaryAsync(x => x.Region, x => x.Skus);

    foreach (var summary in summaries)
    {
        summary.TopSkus = skusByRegion.TryGetValue(summary.Region, out var skus) ? skus : new List<string>();
    }

    return summaries;
}
```

## Explanation

### Issue 1: `ToArray()` inside GroupBy forces client evaluation

**Problem:** After the data migration, the nightly job times out and the app server allocates several gigabytes of memory while the database CPU stays low. The bottleneck is not the database — it is the app server doing work that should stay in SQL.

**Fix:** Remove `ToArray()` from inside the `Select` projection. In the reference solution the inner subquery is moved out of the `GroupBy` entirely (handled in a separate query), and the `ToArray()` call is gone.

**Explanation:** EF Core translates LINQ expressions to SQL. When it encounters `ToArray()` inside a `GroupBy` projection it cannot produce a SQL equivalent, so it switches to client evaluation: it fetches every matching `Order` row across the entire date range into app-server memory, then groups and projects them using LINQ-to-Objects. With hundreds of thousands of rows, each containing all mapped columns, this means gigabytes of data are deserialized into objects in the .NET heap. The app server then burns CPU running the in-memory grouping and sorting. The database is fast because it just streams rows; the pain is entirely on the app side. Removing `ToArray()` (and restructuring so EF Core can translate the full query) keeps all aggregation in PostgreSQL and returns only the small result set.

---

### Issue 2: TopSkus subquery needs a translatable form after removing `ToArray()`

**Problem:** Simply deleting `ToArray()` does not fully fix the problem — EF Core still cannot translate an arbitrary `Distinct().OrderBy()` subquery nested inside a `GroupBy` projection into a single SQL statement in most provider versions. The query either throws a runtime translation exception or silently falls back to client evaluation again.

**Fix:** The reference solution moves the `TopSkus` population into a second `await`ed query that uses `Select`, `Distinct`, `GroupBy`, `OrderBy`, and `ToDictionaryAsync` — all at the top level where EF Core's PostgreSQL provider can translate them. The aggregated summaries and the SKU dictionary are then joined in .NET memory with a simple `foreach` loop.

**Explanation:** EF Core's GroupBy translation rules require that projections inside a grouped `Select` use only aggregate functions (`Count`, `Sum`, `Max`, etc.) or the group key. A nested `Select(o => o.Sku).Distinct().OrderBy(s => s)` inside a `GroupBy` projection is not an aggregate and cannot be expressed as a SQL aggregate function, so the provider cannot emit valid SQL for it. Splitting the work into two queries solves this: the first query does the numeric aggregates entirely in SQL; the second query fetches `(Region, Sku)` pairs with `Distinct` at the row level, then groups and sorts — patterns the provider can translate. The in-memory join is cheap because the number of distinct regions and SKUs is small compared to the raw order count. A related pitfall: `GroupBy` followed by `ToList` or `ToArray` inside a projection is one of the most common EF Core mistakes because it works silently (no exception) until the data volume exposes the memory cost.
