---
slug: linq-deferred-db-context-disposed
track: csharp
orderIndex: 57
title: Deferred LINQ Query After DbContext Disposal
difficulty: medium
tags:
  - linq
  - disposal
  - ef-core
language: csharp
---

## Context

This code lives in `Services/ReportService.cs`. The method builds a report by fetching product data through the repository, then applying in-memory grouping and projection via LINQ. The `ProductRepository` creates its own `DbContext` using a factory, wraps it in a `using` block, and returns `IEnumerable<Product>`. The returned enumerable is then processed by the report service.

The service throws `ObjectDisposedException: Cannot access a disposed context instance` intermittently in production. The exception stack trace always points to the LINQ `.GroupBy().Select()` chain inside `GenerateReportAsync`, not inside the repository. In development the bug does not appear because the data set is small enough that EF materialises the query before the `using` block exits.

The team confirmed the repository itself compiles and runs without error in isolation. They added `ToList()` calls in several places but not the one that matters.

## Buggy code

```csharp
// ProductRepository.cs
public class ProductRepository
{
    private readonly IDbContextFactory<ShopDbContext> _factory;

    public ProductRepository(IDbContextFactory<ShopDbContext> factory)
    {
        _factory = factory;
    }

    public IEnumerable<Product> GetActiveProducts()
    {
        using var db = _factory.CreateDbContext();
        return db.Products.Where(p => p.IsActive);
    }
}

// ReportService.cs
public class ReportService
{
    private readonly ProductRepository _repo;

    public ReportService(ProductRepository repo)
    {
        _repo = repo;
    }

    public async Task<Report> GenerateReportAsync()
    {
        var products = _repo.GetActiveProducts();

        var summary = products
            .GroupBy(p => p.Category)
            .Select(g => new CategorySummary
            {
                Category = g.Key,
                Count = g.Count(),
                TotalRevenue = g.Sum(p => p.Revenue)
            })
            .ToList();

        return new Report { Categories = summary };
    }
}
```
