---
slug: linq-chained-orderby-overrides
track: csharp
orderIndex: 52
title: Second OrderBy Discards First Sort
difficulty: easy
tags:
  - linq
  - correctness
  - ordering
language: csharp
---

## Context

This query is in `Repositories/ProductRepository.cs` and returns a paged list of products for a catalog browsing page. The product team requested that results be sorted first by category (ascending) and then by price (ascending) within each category so users can compare products in the same group.

After deployment, QA reported that the price ordering works but products within the same category are not grouped together — items from different categories are interleaved. The developer initially suspected a caching issue and added cache-busting headers, but the problem persisted on cache-cold requests.

The developer also checked the database schema and confirmed that no default `ORDER BY` clause exists on the underlying view, so the sort order is entirely controlled by this query.

## Buggy code

```csharp
public IReadOnlyList<Product> GetPagedCatalog(
    int pageNumber,
    int pageSize)
{
    return _db.Products
        .Where(p => p.IsActive)
        .OrderBy(p => p.Category)
        .OrderBy(p => p.Price)
        .Skip((pageNumber - 1) * pageSize)
        .Take(pageSize)
        .ToList();
}
```
