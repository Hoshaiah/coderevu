---
slug: linq-groupby-key-ignored
track: csharp
orderIndex: 56
title: GroupBy Result Key Never Read
difficulty: medium
tags:
  - linq
  - correctness
  - groupby
language: csharp
---

## Context

This code lives in `SalesSummaryService.cs`, a reporting microservice that aggregates daily sales figures by region for a dashboard. The method is supposed to return a dictionary mapping region name to total revenue so the frontend can render a bar chart.

The dashboard consistently shows all revenue attributed to a single region — whichever region happens to sort last alphabetically. Other regions show zero. No exceptions are thrown and the method returns a dictionary with the correct number of keys, so the calling code assumes the data is valid.

The developer who wrote this tested it with a single-region dataset where the bug was invisible. Integration tests with multi-region data were added after the fact and caught the symptom, but the root cause was misidentified as a database grouping issue rather than a LINQ bug.

## Buggy code

```csharp
public class SalesSummaryService
{
    private readonly ISalesRepository _repo;

    public SalesSummaryService(ISalesRepository repo)
    {
        _repo = repo;
    }

    public async Task<Dictionary<string, decimal>> GetRevenuByRegionAsync(
        DateOnly date,
        CancellationToken ct)
    {
        var transactions = await _repo.GetTransactionsAsync(date, ct);

        var result = new Dictionary<string, decimal>();

        foreach (var group in transactions.GroupBy(t => t.Region))
        {
            result[group.Key] = transactions.Sum(t => t.Amount);
        }

        return result;
    }
}
```
