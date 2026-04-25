## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Aggregate Throws on Empty Sequence
// ------------------------------------------------------------------------

public class MetricsAggregator
{
    private readonly ISensorRepository _repo;
    private readonly ITelemetryClient _telemetry;

    public MetricsAggregator(ISensorRepository repo, ITelemetryClient telemetry)
    {
        _repo = repo;
        _telemetry = telemetry;
    }

    public async Task ComputePeakAsync(
        string sensorId,
        TimeSpan window,
        CancellationToken ct)
    {
        var since = DateTimeOffset.UtcNow - window;
        var readings = await _repo.GetReadingsAsync(sensorId, since, ct);

        // CHANGE 1: Use Any() to guard against an empty sequence before aggregating; Aggregate throws on empty input but this check lets us skip gracefully.
        var values = readings.Select(r => r.Value).ToList();
        if (!values.Any())
        {
            // CHANGE 2: Return early instead of letting the exception propagate and crash the hosted timer loop; no telemetry is posted for an empty window.
            return;
        }

        double peak = values
            .Aggregate((max, next) => next > max ? next : max);

        await _telemetry.PostAsync(sensorId, "peak", peak, ct);
    }
}
```

## Explanation

### Issue 1: `Aggregate` throws on empty sequence

**Problem:** When no sensor readings fall within the sliding window, `readings.Select(r => r.Value)` produces an empty `IEnumerable<double>`. Calling `Aggregate` on an empty sequence with only the two-argument accumulator overload (no seed) throws `InvalidOperationException: Sequence contains no elements`. Engineers see this exception in the stack trace every minute until data starts flowing again.

**Fix:** A `ToList()` call materialises the projected values, then an `if (!values.Any())` guard at `CHANGE 1` checks for an empty list before the `Aggregate` call is ever reached. `Aggregate` is now only called when at least one element exists.

**Explanation:** The two-argument `Aggregate(func)` overload uses the first element as the initial accumulator value. If the sequence is empty there is no first element, so the overload throws rather than returning a default. The three-argument overload `Aggregate(seed, func)` would not throw, but using a seed of `double.MinValue` or `0` can silently produce a misleading metric. The guard is more explicit: it makes the empty-window case a deliberate, visible decision point. A related pitfall is assuming `Max()` behaves the same way — in .NET 6+, `Enumerable.Max()` on an empty sequence of a non-nullable numeric type also throws, so the guard pattern is correct regardless of which aggregation method you switch to.

---

### Issue 2: Unhandled exception crashes the hosted timer loop

**Problem:** The `InvalidOperationException` is not caught anywhere inside `ComputePeakAsync`, so it bubbles up to the hosted timer's callback. Depending on how the timer is wired, this either silently kills the recurring fire or, in many `IHostedService` implementations, crashes the entire service process, requiring a manual restart to recover.

**Fix:** The `return` statement at `CHANGE 2` exits the method early when the window is empty, so no exception is ever thrown and the hosted timer continues its normal cadence uninterrupted.

**Explanation:** Even if you added a `try/catch` at the call site, swallowing the exception without a guard still leaves the `peak` variable uninitialised. Posting a default or stale value to telemetry can mislead alerting dashboards into thinking the system is healthy when it has no data. Returning early is safer: it posts nothing for the window rather than posting a wrong number. If the product requirement is to emit a specific sentinel (for example `double.NaN` or `-1`) when data is absent, that value can replace the `return`, but the key fix is that the empty-sequence path is handled explicitly before reaching `Aggregate`.
