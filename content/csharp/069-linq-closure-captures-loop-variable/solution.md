## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — LINQ Closure Captures Loop Variable
// ------------------------------------------------------------------------

public class ReportScheduler
{
    private readonly IReportRunner _runner;

    public ReportScheduler(IReportRunner runner)
    {
        _runner = runner;
    }

    public IReadOnlyList<ScheduledTask> BuildTasks(List<ReportConfig> configs)
    {
        var tasks = new List<ScheduledTask>();

        for (int i = 0; i < configs.Count; i++)
        {
            // CHANGE 1: Capture a local copy of configs[i] so the lambda closes over a stable value instead of the loop variable `i`, which would be configs.Count by the time any task executes.
            var config = configs[i];
            var task = new ScheduledTask
            {
                Name = config.Name,
                CronExpression = config.Cron,
                // CHANGE 2: Reference `config` (the captured local) instead of `configs[i]` so each lambda holds its own snapshot of the correct ReportConfig and never reads a stale or out-of-range index.
                Execute = async () =>
                {
                    var result = await _runner.RunAsync(config.ReportType, config.DaysBack);
                    await result.SaveAsync();
                }
            };
            tasks.Add(task);
        }

        return tasks;
    }
}
```

## Explanation

### Issue 1: Closure captures loop variable by reference

**Problem:** Every `Execute` lambda closes over the variable `i`, not the value of `i` at the moment the lambda is created. By the time any scheduled task runs, the `for` loop has finished and `i` equals `configs.Count`. All lambdas then evaluate `configs[i]` with the same final value, so they all produce output for the same config (the last one), or throw an `IndexOutOfRangeException`.

**Fix:** Add `var config = configs[i];` immediately before the `ScheduledTask` initializer (CHANGE 1), then replace every occurrence of `configs[i]` inside the lambda with `config` (CHANGE 2). Each iteration now creates a distinct local variable whose lifetime matches the lambda that captures it.

**Explanation:** In C#, a lambda does not snapshot the value of a variable — it captures a reference to the variable itself. The variable `i` is a single storage location shared across all loop iterations. When the loop ends, `i` holds `configs.Count`. Every lambda that reads `i` later will read that final value. Creating a fresh local variable `config` inside each iteration gives each lambda its own independent storage location. Because the loop body runs as a new scope per iteration in C# (unlike JavaScript `var`, C# `for` still shares `i`, but a new `var` declared inside the body is per-iteration), each lambda captures a different `config` binding. A related pitfall: `foreach` in older versions of C# (before C# 5 / .NET 4.5) had the same problem with its iteration variable, but modern C# fixed `foreach`; `for` with an explicit index variable is still affected and always requires this manual copy.

---

### Issue 2: Stale index access causes wrong-config reads or index out-of-range

**Problem:** Because `i` is `configs.Count` when the lambdas execute, `configs[i]` accesses one position past the end of the list. In practice this throws `ArgumentOutOfRangeException` the first time any task runs, or — if the scheduler catches exceptions internally — silently skips all output, which users see as missing reports.

**Fix:** The same CHANGE 2 that replaces `configs[i]` with `config` inside the lambda body eliminates the invalid index access entirely, because `config` is a direct reference to the correct `ReportConfig` object captured at loop-construction time.

**Explanation:** Once `i` is stale, any expression that dereferences `configs[i]` is reading from an invalid index. Even if the runtime happened to clamp the index, you would still read the wrong element. Switching to a captured object reference (`config`) bypasses the index completely: the lambda holds a direct pointer to the `ReportConfig` it needs, so there is no index arithmetic at execution time and no dependency on the loop variable at all. A related pitfall is mutating the `configs` list after `BuildTasks` returns — with a captured object reference the lambda would still see the mutated object, so if callers modify individual `ReportConfig` properties later, tasks would pick up those mutations. If immutability is required, copy the relevant fields into value-typed locals instead.
