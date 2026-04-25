---
slug: cancellation-linked-cts-disposed-too-early
track: csharp
orderIndex: 92
title: Linked CancellationTokenSource Disposed Mid-Operation
difficulty: hard
tags:
  - cancellation
  - disposal
  - async
language: csharp
---

## Context

`Handlers/SearchQueryHandler.cs` handles search requests that must respect both the HTTP request's abort token and an application-level 5-second timeout. It creates a linked `CancellationTokenSource` combining both signals and passes the merged token to the downstream search service.

In production, the app logs `ObjectDisposedException: The CancellationTokenSource has been disposed` from inside the search service's HTTP calls, but only on slow queries that approach the timeout. Fast queries never exhibit the issue. The error appears mid-flight, not at request teardown.

The team verified the downstream `SearchService` is not disposing anything it shouldn't. They reproduced the issue by introducing an artificial 4-second delay in a staging environment.

## Buggy code

```csharp
public async Task<SearchResult> HandleAsync(
    SearchRequest request,
    CancellationToken requestCt)
{
    CancellationToken mergedToken;

    using (var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
               requestCt,
               _appShutdownCt))
    {
        linkedCts.CancelAfter(TimeSpan.FromSeconds(5));
        mergedToken = linkedCts.Token;
    } // linkedCts is disposed here — mergedToken is now backed by a dead CTS

    return await _searchService.ExecuteAsync(request, mergedToken);
}
```
