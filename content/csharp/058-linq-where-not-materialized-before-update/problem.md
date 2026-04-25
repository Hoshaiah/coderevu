---
slug: linq-where-not-materialized-before-update
track: csharp
orderIndex: 58
title: Deferred LINQ Sees Modified Collection
difficulty: medium
tags:
  - linq
  - deferred-execution
  - correctness
language: csharp
---

## Context

This code is in `Services/InventoryRebalancer.cs`, a domain service that redistributes stock quantities across warehouse bins. It is called from an ASP.NET Core controller action. The method receives a list of `BinStock` objects (plain in-memory objects, not EF entities), identifies bins that are over-capacity, and drains them by moving excess units to a spare bin.

Warehouse managers report that after rebalancing, some bins still show quantities above their capacity, and the `spareBin` sometimes has a negative quantity. The bug is non-deterministic: small datasets pass, larger ones fail. No exceptions are thrown and the method returns without error.

The team added logging before and after the loop and confirmed that individual drain operations execute correctly in isolation. They ruled out thread-safety issues because the method is single-threaded.

## Buggy code

```csharp
public void Rebalance(List<BinStock> bins, BinStock spareBin)
{
    // Query is deferred — evaluated lazily on each iteration
    var overCapacity = bins.Where(b => b.Quantity > b.Capacity);

    foreach (var bin in overCapacity)
    {
        int excess = bin.Quantity - bin.Capacity;
        bin.Quantity -= excess;
        spareBin.Quantity += excess;
    }
}

public class BinStock
{
    public string BinId { get; set; }
    public int Quantity { get; set; }
    public int Capacity { get; set; }
}
```
