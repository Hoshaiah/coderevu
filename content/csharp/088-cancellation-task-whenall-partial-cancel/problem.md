---
slug: cancellation-task-whenall-partial-cancel
track: csharp
orderIndex: 88
title: WhenAll Swallows Cancellation Exception
difficulty: hard
tags:
  - cancellation
  - async
  - error-handling
language: csharp
---

## Context

This method is in `Orchestrators/DataRefreshOrchestrator.cs` and fans out a set of data-refresh tasks across multiple downstream services. It is called from an API endpoint with a request `CancellationToken` so that long-running refreshes can be aborted if the client disconnects.

Operators report that when a client disconnects mid-request, the server continues executing all downstream HTTP calls for the full duration instead of aborting. The `CancellationToken` is confirmed to be signalled correctly — a log line placed right after the endpoint receives the disconnection fires immediately. But the orchestrator appears to keep running regardless.

The developer traced the issue down to this method and confirmed that the individual `RefreshAsync` calls do respect cancellation when called in isolation. The problem only surfaces when they are combined.

## Buggy code

```csharp
public async Task<RefreshResult[]> RefreshAllAsync(
    IReadOnlyList<string> serviceNames,
    CancellationToken cancellationToken)
{
    var tasks = serviceNames
        .Select(name => RefreshAsync(name, cancellationToken))
        .ToList();

    try
    {
        return await Task.WhenAll(tasks);
    }
    catch (OperationCanceledException)
    {
        // Cancellation is expected; return whatever completed.
        var results = tasks
            .Where(t => t.IsCompletedSuccessfully)
            .Select(t => t.Result)
            .ToArray();

        return results;
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Refresh failed");
        throw;
    }
}
```
