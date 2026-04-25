## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Mixing local and UTC DateTime values causes off-by-hours scheduling errors
// ------------------------------------------------------------------------
public class JobPoller
{
    private readonly IJobRepository _repo;
    private readonly IJobRunner _runner;

    public JobPoller(IJobRepository repo, IJobRunner runner)
    {
        _repo = repo;
        _runner = runner;
    }

    public async Task PollAsync()
    {
        // CHANGE 1: Use DateTime.UtcNow instead of DateTime.Now so the value matches the UTC values stored in the database. DateTime.Now returns the host's local time, which is offset from UTC by the server's timezone, causing tasks to be scheduled hours early or late.
        // CHANGE 2: The resulting DateTime has Kind == DateTimeKind.Utc, making the intent explicit and preventing silent Kind mismatches.
        var now = DateTime.UtcNow;
        var dueTasks = await _repo.GetTasksDueBeforeAsync(now);

        foreach (var task in dueTasks)
        {
            await _runner.RunAsync(task);
            await _repo.MarkCompletedAsync(task.Id);
        }
    }
}
```

## Explanation

### Issue 1: Local time compared against UTC database values

**Problem:** The worker calls `DateTime.Now`, which returns the current time in the host machine's local timezone. The database column holds UTC values. In the US East datacenter (UTC-5), `DateTime.Now` is 5 hours behind UTC, so `GetTasksDueBeforeAsync` receives a timestamp that is 5 hours in the past relative to the stored values — tasks that are genuinely due right now appear to not be due yet for another 5 hours. In Sydney (UTC+8) the opposite happens: the local time is 8 hours ahead, so tasks are retrieved and executed 8 hours before they should be.

**Fix:** Replace `DateTime.Now` with `DateTime.UtcNow` on the line marked `// CHANGE 1`. This produces the current UTC instant, which matches the values stored in the database column.

**Explanation:** SQL Server `datetime` columns have no timezone information attached — they store a raw number. The application convention here is "always store UTC", so the only correct comparator is also UTC. `DateTime.Now` asks the OS for the local wall-clock time, which the OS computes by applying the host's configured UTC offset to the current UTC instant. That offset varies by datacenter, so the same binary behaves differently on every host. `DateTime.UtcNow` skips the offset entirely and returns the UTC instant directly. A related pitfall: if you later serialize these values to JSON or pass them across a boundary, prefer `DateTimeOffset.UtcNow` so the offset is carried with the value and cannot be reinterpreted by another layer.

---

### Issue 2: DateTimeKind.Unspecified allows silent mismatches

**Problem:** `DateTime.Now` returns a `DateTime` with `Kind == DateTimeKind.Local`. If this value is ever passed to a library or ORM that inspects `Kind` (e.g., Dapper or EF Core with certain configurations), it may silently convert or ignore the kind, masking the timezone bug rather than surfacing it as an error. No exception is thrown; the wrong answer is just quietly used.

**Fix:** `DateTime.UtcNow` (the replacement at `// CHANGE 2`) returns a `DateTime` with `Kind == DateTimeKind.Utc`. The kind is now consistent with the intent, so any library that checks `Kind` before converting will behave correctly rather than silently mishandling a `Local` value.

**Explanation:** `DateTime` carries a `Kind` field (`Unspecified`, `Local`, or `Utc`) that is metadata about what the number means, but most arithmetic and comparison operators ignore it entirely — you can subtract a `Local` from a `Utc` value and get a `TimeSpan` with no warning. Some ORMs and serializers do inspect `Kind` and apply conversions when they see `Local`, which can double-apply an offset. Using `DateTime.UtcNow` ensures `Kind` is `Utc`, so the value, its kind, and the database content are all consistent. If your codebase grows to cross service boundaries, switching to `DateTimeOffset` removes the ambiguity entirely because the offset is always stored with the value.
