---
slug: datetime-utc-comparison
track: csharp
orderIndex: 95
title: Mixing local and UTC DateTime values causes off-by-hours scheduling errors
difficulty: easy
tags:
  - correctness
  - datetime
  - timezone
  - scheduling
language: csharp
---

## Context

A job scheduler stores task due times in a SQL Server database as `datetime` columns containing UTC values. A worker service polls every minute and executes tasks whose `DueAt` has passed. In the UTC+0 London datacenter everything is fine, but in the US East datacenter (UTC-5) tasks run 5 hours late, and in a UTC+8 Sydney datacenter they run 8 hours early.

## Buggy code

```csharp
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
        var now = DateTime.Now;  // local time on the host
        var dueTasks = await _repo.GetTasksDueBeforeAsync(now);

        foreach (var task in dueTasks)
        {
            await _runner.RunAsync(task);
            await _repo.MarkCompletedAsync(task.Id);
        }
    }
}
```
