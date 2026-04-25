---
slug: linq-select-project-then-filter
track: csharp
orderIndex: 48
title: LINQ Project Before Filter Loads All Rows
difficulty: easy
tags:
  - linq
  - performance
  - ef-core
language: csharp
---

## Context

This code lives in `Repositories/CustomerRepository.cs`, a data access class in an ASP.NET Core API backed by Entity Framework Core and SQL Server. The `GetActiveCustomerEmailsAsync` method is called on every request to the `/api/notifications/batch` endpoint, which sends promotional emails to active customers.

The endpoint has become slow as the customer table grows. SQL Server query stats show it performing a full table scan returning hundreds of thousands of rows. Memory spikes on the API server are visible in the metrics dashboard during each notification batch run. The database query completes quickly, but the API response is slow and memory briefly balloons.

The team confirmed that SQL profiling shows the filter is not making it to the database — the query plan shows no `WHERE` clause. EF Core migrations and indexes are fine.

## Buggy code

```csharp
public class CustomerRepository
{
    private readonly AppDbContext _db;

    public CustomerRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<string>> GetActiveCustomerEmailsAsync()
    {
        return await _db.Customers
            .Select(c => new { c.Email, c.IsActive })
            .AsAsyncEnumerable()
            .Where(c => c.IsActive)
            .Select(c => c.Email)
            .ToListAsync();
    }
}
```
