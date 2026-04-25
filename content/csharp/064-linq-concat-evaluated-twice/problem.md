---
slug: linq-concat-evaluated-twice
track: csharp
orderIndex: 64
title: Concat Source Enumerated Twice
difficulty: medium
tags:
  - linq
  - deferred-execution
  - side-effects
  - correctness
language: csharp
---

## Context

This code is in `Notifications/NotificationAggregator.cs` and assembles a deduplicated list of notification targets by combining an in-memory priority list with a database query. The result is passed to a bulk-send method. The database query is expressed as an `IQueryable` and the combined sequence is deduplicated via `Distinct()` before materialisation.

The team notices that the database audit log records each notification recipient query **twice** per aggregation run, and SQL Server profiler shows the same SELECT being executed twice per call. In some environments this causes double sends because a second enumeration races with a status-update side effect in a trigger. No exception is ever thrown.

The team suspects the `Distinct()` call but has not identified the root cause. The real issue is a deferred enumeration being consumed more than once.

## Buggy code

```csharp
public async Task<IReadOnlyList<NotificationTarget>> GetTargetsAsync(Guid eventId)
{
    var priorityTargets = GetPriorityTargets(); // returns IEnumerable<NotificationTarget>

    var dbTargets = _db.NotificationTargets
        .Where(t => t.EventId == eventId && t.IsActive)
        .Select(t => new NotificationTarget { Id = t.Id, Address = t.Address });
        // IQueryable<NotificationTarget> — not yet executed

    var combined = priorityTargets.Concat(dbTargets);

    var distinct = combined.Distinct();

    // Check count before materialising to log expected volume
    _logger.LogInformation("Sending to {Count} targets", distinct.Count());

    return distinct.ToList();
}
```
