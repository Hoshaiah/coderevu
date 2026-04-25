---
slug: async-task-run-wraps-already-async
track: csharp
orderIndex: 13
title: Task.Run Wraps Naturally Async Method
difficulty: medium
tags:
  - async
  - performance
  - thread-pool
language: csharp
---

## Context

This code is in `Services/DocumentIndexer.cs`, a service in an enterprise search platform. It processes documents uploaded via an HTTP endpoint and indexes them by calling an Elasticsearch client library. The method is invoked from an ASP.NET Core controller and is expected to be non-blocking.

The application handles document uploads adequately at low traffic, but under sustained load the thread pool becomes saturated much earlier than expected. `ThreadPool.GetAvailableThreads` shows exhaustion during peak hours. Response times climb and `503` errors appear. Memory is fine, and CPU is not spiked — it's thread starvation, not compute pressure.

The team used a profiler and found that most threads are blocked waiting for I/O inside thread pool threads unnecessarily. They suspected a synchronization issue but the real problem is a structural one in how the async work is scheduled.

## Buggy code

```csharp
public class DocumentIndexer
{
    private readonly IElasticClient _elastic;
    private readonly ILogger<DocumentIndexer> _logger;

    public DocumentIndexer(IElasticClient elastic, ILogger<DocumentIndexer> logger)
    {
        _elastic = elastic;
        _logger = logger;
    }

    public async Task IndexDocumentAsync(Document doc, CancellationToken cancellationToken)
    {
        await Task.Run(async () =>
        {
            _logger.LogDebug("Indexing document {Id}", doc.Id);

            var response = await _elastic.IndexDocumentAsync(doc, cancellationToken);

            if (!response.IsValid)
            {
                throw new InvalidOperationException(
                    $"Failed to index document {doc.Id}: {response.DebugInformation}");
            }

            _logger.LogInformation("Indexed document {Id}", doc.Id);
        }, cancellationToken);
    }
}
```
