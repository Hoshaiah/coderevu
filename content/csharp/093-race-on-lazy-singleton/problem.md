---
slug: race-on-lazy-singleton
track: csharp
orderIndex: 93
title: >-
  Non-thread-safe lazy initialisation produces duplicate singletons under
  concurrent requests
difficulty: medium
tags:
  - concurrency
  - thread-safety
  - singleton
  - race-condition
language: csharp
---

## Context

An ASP.NET Core background service loads a large in-memory lookup table from the database when first needed, then caches it for the process lifetime. During high-traffic startup bursts, the service occasionally logs the expensive `LoadFromDatabase` message more than once, and different request threads end up using different table instances, leading to inconsistent results for a few seconds.

## Buggy code

```csharp
public class LookupTableService
{
    private readonly IDbConnectionFactory _db;
    private static LookupTable? _cache;

    public LookupTableService(IDbConnectionFactory db)
    {
        _db = db;
    }

    public async Task<LookupTable> GetTableAsync()
    {
        if (_cache != null)
            return _cache;

        Console.WriteLine("Loading lookup table from database...");
        var table = await LoadFromDatabaseAsync();
        _cache = table;
        return _cache;
    }

    private async Task<LookupTable> LoadFromDatabaseAsync()
    {
        await Task.Delay(500); // simulate DB round-trip
        return new LookupTable();
    }
}
```
