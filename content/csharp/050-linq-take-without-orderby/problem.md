---
slug: linq-take-without-orderby
track: csharp
orderIndex: 50
title: Take Without OrderBy Nondeterministic
difficulty: easy
tags:
  - linq
  - correctness
  - ef-core
language: csharp
---

## Context

This query lives in `Repositories/ProductRepository.cs` in an ASP.NET Core 7 e-commerce API backed by SQL Server. The `GetFeaturedProductsAsync` method is called by the homepage endpoint to display the five "featured" products in a promotional banner.

Product managers report that the banner sometimes shows different products on page refresh, and occasionally shows products that are marked inactive. QA can reliably reproduce the inconsistency by hitting the endpoint from two browser tabs simultaneously. The issue was not visible during development where the database had only a handful of rows.

The developer intended to show the five products with the highest `DisplayOrder` value, but the implementation was written quickly and skipped adding an explicit sort, assuming SQL Server would return rows "in order".

## Buggy code

```csharp
public class ProductRepository
{
    private readonly AppDbContext _db;

    public ProductRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<Product>> GetFeaturedProductsAsync()
    {
        return await _db.Products
            .Where(p => p.IsActive && p.IsFeatured)
            .Take(5)
            .ToListAsync();
    }
}
```
