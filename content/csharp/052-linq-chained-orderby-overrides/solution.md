## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Second OrderBy Discards First Sort
// ------------------------------------------------------------------------

public IReadOnlyList<Product> GetPagedCatalog(
    int pageNumber,
    int pageSize)
{
    return _db.Products
        .Where(p => p.IsActive)
        .OrderBy(p => p.Category)
        // CHANGE 1: Replace second .OrderBy with .ThenBy so the category sort is preserved and price becomes a secondary sort key within each category.
        .ThenBy(p => p.Price)
        .Skip((pageNumber - 1) * pageSize)
        .Take(pageSize)
        .ToList();
}
```

## Explanation

### Issue 1: Second `OrderBy` Discards First Sort

**Problem:** Products are sorted only by price across the entire result set. Items from different categories are interleaved, so a user browsing the catalog cannot compare products within the same category. The category grouping the product team requested is completely absent.

**Fix:** Replace the second `.OrderBy(p => p.Price)` call with `.ThenBy(p => p.Price)` immediately after `.OrderBy(p => p.Category)`. This is the only line changed.

**Explanation:** In LINQ (and the SQL it generates), each call to `.OrderBy` on an `IOrderedQueryable` starts a brand-new `ORDER BY` clause, throwing away any previously established sort. So `.OrderBy(p => p.Category).OrderBy(p => p.Price)` translates to `ORDER BY Price ASC` with no mention of `Category`. `.ThenBy`, by contrast, appends a secondary sort key, producing `ORDER BY Category ASC, Price ASC`. The resulting SQL groups rows by category first, then orders rows within each category by price — exactly what the product team specified. A related pitfall: the same behavior occurs with `.OrderByDescending` followed by another `.OrderBy`; always use `.ThenBy` / `.ThenByDescending` for every sort key after the first.

---
