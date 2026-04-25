---
slug: disposing-injected-dependency
track: csharp
orderIndex: 23
title: Disposing an Injected Dependency
difficulty: easy
tags:
  - disposal
  - dependency-injection
  - lifetime
language: csharp
---

## Context

This class lives in `Repositories/ProductRepository.cs` in an ASP.NET Core 7 Web API. It receives an `ApplicationDbContext` via constructor injection, using Entity Framework Core. The DI container is configured with `AddDbContext<ApplicationDbContext>` (scoped lifetime by default).

After the first few requests succeed, subsequent requests to any endpoint that touches the database throw `ObjectDisposedException: Cannot access a disposed context instance`. The error happens on what looks like a perfectly fresh request with a new scope.

The team confirmed the `DbContext` is registered as scoped, and the repository is also scoped. They verified that no other code disposes the context. Adding logging inside the repository's constructor shows it is being constructed fresh each request — but the error still occurs.

## Buggy code

```csharp
public class ProductRepository : IProductRepository, IDisposable
{
    private readonly ApplicationDbContext _db;

    public ProductRepository(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<Product?> GetByIdAsync(int id)
    {
        return await _db.Products.FindAsync(id);
    }

    public async Task<List<Product>> GetAllAsync()
    {
        return await _db.Products.ToListAsync();
    }

    public async Task AddAsync(Product product)
    {
        _db.Products.Add(product);
        await _db.SaveChangesAsync();
    }

    public void Dispose()
    {
        _db.Dispose();
    }
}
```
