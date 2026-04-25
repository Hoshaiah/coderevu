---
slug: linq-aggregate-seed-mutation
track: csharp
orderIndex: 72
title: Aggregate Seed Object Shared Across Calls
difficulty: hard
tags:
  - linq
  - correctness
  - reference-types
language: csharp
---

## Context

`Analytics/SessionAggregator.cs` processes a stream of user event records and aggregates them into session statistics. It is called from a Hangfire background job that runs once per minute and processes the previous minute's events, storing results to a stats database.

Stats occasionally show incorrect cumulative values: two sessions' data gets merged into one, or a session shows event counts far higher than should be possible. The bug appears only when multiple sessions are processed in the same invocation. Reruns of the same job produce different wrong results each time.

The team added logging and confirmed the raw input events are correct. They also verified the database writes are transactional. The problem is consistently in the in-memory aggregation step.

## Buggy code

```csharp
public List<SessionStats> Aggregate(IEnumerable<UserEvent> events)
{
    var seed = new SessionStats(); // one shared instance

    return events
        .GroupBy(e => e.SessionId)
        .Select(g => g.Aggregate(
            seed,
            (acc, e) =>
            {
                acc.SessionId = e.SessionId;
                acc.EventCount++;
                acc.LastSeen = e.Timestamp > acc.LastSeen ? e.Timestamp : acc.LastSeen;
                acc.TotalDuration += e.DurationMs;
                return acc;
            }))
        .ToList();
}
```
