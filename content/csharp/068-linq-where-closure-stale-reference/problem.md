---
slug: linq-where-closure-stale-reference
track: csharp
orderIndex: 68
title: Where Closure Captures Mutable Outer Variable
difficulty: medium
tags:
  - linq
  - closure
  - correctness
language: csharp
---

## Context

`Services/FilterPipelineService.cs` builds a dynamic chain of LINQ filters based on a list of `FilterRule` objects loaded from the database. Each rule specifies a field name and a threshold value. The service constructs a series of `.Where` predicates and applies them to a product catalog query.

Product search results are consistently wrong: some filters appear to apply the wrong threshold, and results include products that should have been excluded. The bug is reliably reproducible: the same request always returns the same wrong results, but different rules always seem to use the last rule's threshold value.

The team stepped through the filter construction code and confirmed each `FilterRule` has the correct values when the predicates are created. The predicates just don't seem to remember those values correctly.

## Buggy code

```csharp
public IEnumerable<Product> ApplyFilters(
    IEnumerable<Product> products,
    List<FilterRule> rules)
{
    var query = products.AsEnumerable();

    FilterRule rule;
    for (int i = 0; i < rules.Count; i++)
    {
        rule = rules[i];
        query = query.Where(p => rule.Field == "Price"
            ? p.Price <= rule.Threshold
            : p.StockLevel >= (int)rule.Threshold);
    }

    return query.ToList();
}
```
