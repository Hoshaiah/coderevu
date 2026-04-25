---
slug: sql-injection-string-format
track: csharp
orderIndex: 100
title: Interpolated SQL string allows injection and leaks arbitrary data
difficulty: easy
tags:
  - security
  - sql-injection
  - dapper
  - input-validation
language: csharp
---

## Context

A REST API endpoint lets authenticated users search for products by name. The endpoint uses Dapper to query a SQL Server database. During a penetration test, the tester retrieves the entire `users` table by passing `'; SELECT * FROM users--` as the search term. The dev team can reproduce it locally with any string containing a single quote.

## Buggy code

```csharp
public class ProductRepository
{
    private readonly IDbConnection _db;

    public ProductRepository(IDbConnection db)
    {
        _db = db;
    }

    public async Task<IEnumerable<Product>> SearchAsync(string searchTerm)
    {
        var sql = $"SELECT Id, Name, Price FROM Products "
                + $"WHERE Name LIKE '%{searchTerm}%' "
                + $"ORDER BY Name";

        return await _db.QueryAsync<Product>(sql);
    }
}
```
