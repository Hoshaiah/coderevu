---
slug: linq-enumerable-side-effect-in-where
track: csharp
orderIndex: 66
title: Mutation Inside LINQ Predicate
difficulty: medium
tags:
  - linq
  - correctness
  - side-effects
language: csharp
---

## Context

`OrderProcessor.cs` processes a list of pending orders in a nightly batch job. It uses a LINQ query to both filter orders that need fulfilment *and* mark them as claimed by this processor instance (to prevent double-processing by other nodes). The claim flag is set on the entity inside the `Where` predicate as a side-effect.

Support reported that on nights when the batch list is empty, some orders never get claimed. Investigation with added logging showed that orders are present in the database but the downstream fulfilment step receives zero orders. A second run of the batch a minute later claims and processes the exact same orders, causing duplicate shipments.

The team checked locking and database isolation and found no issues there. They added a log line immediately after the LINQ query and it shows the list is empty. A developer noticed the symptom correlates with days when more than half the orders in the batch are filtered out by a second `Where` clause that was added three months ago.

## Buggy code

```csharp
public class OrderProcessor
{
    private readonly IOrderRepository _repo;
    private readonly string _nodeId;

    public OrderProcessor(IOrderRepository repo, string nodeId)
    {
        _repo = repo;
        _nodeId = nodeId;
    }

    public async Task<IReadOnlyList<Order>> ClaimAndFetchAsync()
    {
        var candidates = await _repo.GetPendingAsync();

        // Mark orders as claimed by this node while filtering.
        // Only return orders that are high-priority or overdue.
        var claimed = candidates
            .Where(o =>
            {
                o.ClaimedBy = _nodeId;   // side-effect: marks the order
                o.ClaimedAt = DateTime.UtcNow;
                return true;             // include all so the claim sticks
            })
            .Where(o => o.IsHighPriority || o.IsOverdue)
            .ToList();

        await _repo.SaveChangesAsync();
        return claimed;
    }
}
```
