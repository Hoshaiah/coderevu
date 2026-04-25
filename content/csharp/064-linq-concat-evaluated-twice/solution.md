## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Concat Source Enumerated Twice
// ------------------------------------------------------------------------

public async Task<IReadOnlyList<NotificationTarget>> GetTargetsAsync(Guid eventId)
{
    var priorityTargets = GetPriorityTargets(); // returns IEnumerable<NotificationTarget>

    var dbTargets = _db.NotificationTargets
        .Where(t => t.EventId == eventId && t.IsActive)
        .Select(t => new NotificationTarget { Id = t.Id, Address = t.Address });
        // IQueryable<NotificationTarget> — not yet executed

    var combined = priorityTargets.Concat(dbTargets);

    // CHANGE 1 & 2: Materialise the combined sequence exactly once before calling Distinct(), so the database query runs only a single time and .Count() reads from the in-memory list rather than re-executing the IQueryable.
    var materialised = combined.ToList();

    var distinct = materialised.Distinct().ToList();

    // CHANGE 1: Read .Count from the already-materialised list — no second database round-trip.
    _logger.LogInformation("Sending to {Count} targets", distinct.Count);

    return distinct;
}
```

## Explanation

### Issue 1: IQueryable Enumerated Twice

**Problem:** The database audit log records each recipient query twice per aggregation run, and SQL Server profiler shows two identical SELECT statements per call to `GetTargetsAsync`. In environments where a trigger updates row state on read, a second enumeration can send notifications to recipients a second time.

**Fix:** Insert `combined.ToList()` before any further LINQ operations to produce `materialised`, then operate on that in-memory list. Replace the `distinct.Count()` call with `distinct.Count` (the `List<T>.Count` property) so it never touches the database again.

**Explanation:** `dbTargets` is an `IQueryable<T>` — a query definition, not data. Every time something iterates it, Entity Framework translates it back to SQL and sends it to the database. In the original code, `distinct` still holds a reference to the original `IQueryable` chain. Calling `distinct.Count()` iterates the chain once (first SELECT), and then `distinct.ToList()` iterates it a second time (second SELECT). Materialising with `ToList()` immediately after `Concat()` collapses the query into a plain `List<NotificationTarget>` in memory. All subsequent LINQ calls (`Distinct`, `Count`) operate purely in-process. A related pitfall: if you materialise after `Distinct()` instead of before, you still have the IQueryable reachable through the chain and the same double-execution can occur if the reference is captured elsewhere.

---

### Issue 2: Distinct Applied Before Materialisation Multiplies Query Executions

**Problem:** `Distinct()` applied to an `IQueryable`-backed sequence does not buffer results; it wraps the source in another deferred iterator. Each time the outer iterator is pulled, it pulls from the source again, which re-executes the SQL. This means even a single additional LINQ operator applied after `Distinct()` can silently add another database round-trip.

**Fix:** Move `ToList()` to immediately after `Concat()`, before `Distinct()`, so that `Distinct()` operates on a `List<NotificationTarget>` instead of an `IQueryable` chain.

**Explanation:** LINQ's `Distinct()` works as a streaming filter: it maintains a hash set of seen elements and yields each element the first time it appears. To do that, it must iterate its source. If the source is an `IQueryable`, each iteration compiles and sends a new SQL query. By materialising first, `Distinct()` pulls from a `List<T>` sitting in heap memory — no SQL, no trigger, no audit entry. The order of materialisation matters: `Concat` then `ToList` ensures all sources are read exactly once in a single pass, then all downstream operations are cheap in-memory work.
