---
slug: linq-first-vs-firstordefault-exception
track: csharp
orderIndex: 54
title: First() on Filtered Sequence Throws on Miss
difficulty: easy
tags:
  - linq
  - correctness
  - error-handling
language: csharp
---

## Context

`Services/FeatureFlagService.cs` resolves feature flags for incoming requests. It loads all flags once at startup into a static list and then uses LINQ to look up individual flags by name during request handling. Feature flags can be dynamically removed from the database and the in-memory list is refreshed every 5 minutes.

The application throws `InvalidOperationException: Sequence contains no matching element` in production approximately once per hour, always from this service. The stack trace shows the error originates from a LINQ call inside `GetFlag`. The exception propagates uncaught and results in a 500 response. The issue correlates with the flag refresh cycle — it happens right after a flag is removed from the database.

The team confirmed the refresh logic is correct and the flag really does not exist in the list after removal. They want the service to return a default disabled flag when the name is not found, not throw.

## Buggy code

```csharp
public class FeatureFlagService
{
    private volatile List<FeatureFlag> _flags = new();

    public void RefreshFlags(IEnumerable<FeatureFlag> latest)
    {
        _flags = latest.ToList();
    }

    public FeatureFlag GetFlag(string name)
    {
        return _flags.First(f => f.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
    }

    public bool IsEnabled(string name)
    {
        return GetFlag(name).IsEnabled;
    }
}
```
