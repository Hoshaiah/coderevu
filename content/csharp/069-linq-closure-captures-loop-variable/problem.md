---
slug: linq-closure-captures-loop-variable
track: csharp
orderIndex: 69
title: LINQ Closure Captures Loop Variable
difficulty: hard
tags:
  - linq
  - closures
  - correctness
language: csharp
---

## Context

This code lives in `Services/ReportScheduler.cs`. It builds a set of scheduled tasks from a list of report configurations, where each task should query data for its specific report type and date offset. The service is called once at startup to register all tasks with the scheduler. The project uses .NET 7.

Users notice that every scheduled report produces identical output — the data for whichever report config happened to be last in the configuration list. For example, if configs are `[Daily, Weekly, Monthly]`, all three scheduled tasks produce the Monthly report. The bug is consistent and fully reproducible.

The team traced through the code with a debugger and confirmed that the `configs` list is populated correctly before `BuildTasks` is called. They also confirmed that the individual task execution method is correct when called directly with explicit arguments.

## Buggy code

```csharp
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
            var task = new ScheduledTask
            {
                Name = configs[i].Name,
                CronExpression = configs[i].Cron,
                Execute = async () =>
                {
                    var result = await _runner.RunAsync(configs[i].ReportType, configs[i].DaysBack);
                    await result.SaveAsync();
                }
            };
            tasks.Add(task);
        }

        return tasks;
    }
}
```
