## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Aggregate Seed Object Shared Across Calls
// ------------------------------------------------------------------------

public List<SessionStats> Aggregate(IEnumerable<UserEvent> events)
{
    return events
        .GroupBy(e => e.SessionId)
        .Select(g => g.Aggregate(
            // CHANGE 1: Create a fresh SessionStats per group instead of reusing one shared seed; the shared seed caused every group to mutate the same object and bleed data across sessions.
            new SessionStats(),
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

## Explanation

### Issue 1: Shared Seed Instance Across Groups

**Problem:** Every call to `Aggregate` on every `GroupBy` group receives the exact same `SessionStats` object as its seed. Each group mutates that object in place and returns it. The result is that all groups' events are accumulated into one object, producing absurd event counts and merged session data. Reruns produce different wrong results because `GroupBy` does not guarantee group ordering.

**Fix:** Move `new SessionStats()` from a variable declared before the query into the first argument of `g.Aggregate(...)` directly, so the expression is evaluated once per group rather than once per method call.

**Explanation:** `Enumerable.Aggregate` takes a seed value and an accumulator function. When you pass a reference-type seed that was created outside the `Select`, every group's lambda receives a pointer to the same heap object. The first group writes `SessionId = "A"`, `EventCount = 3`; the second group then continues from that state and writes `SessionId = "B"`, `EventCount = 7` (3 + 4). The `ToList` then holds multiple references all pointing at that one object, so after evaluation every entry shows the final state of the last group processed. Placing `new SessionStats()` as a literal argument inside the `Select` lambda means the C# compiler evaluates that expression on each invocation of the lambda — once per group — giving each group its own zeroed-out accumulator. A related pitfall: if you ever switch to `Parallel.ForEach` or PLINQ, a shared mutable seed would also cause data races on top of this logic bug.

---
