---
slug: cancellation-register-captures-large-object
track: csharp
orderIndex: 90
title: Token Registration Roots Large Buffer
difficulty: hard
tags:
  - cancellation
  - disposal
  - memory
language: csharp
---

## Context

This class is in `BulkIngestionWorker.cs`, a long-running background service that reads large CSV files from blob storage, processes them in 10 MB byte-array chunks, and writes results to a SQL database. Each chunk is processed by a `ChunkProcessor` that registers a cancellation callback to abort an in-progress native library call if the token fires.

Memory profiling showed the process's working set grows by roughly 10 MB per chunk processed and never shrinks, even though all `byte[]` allocations are short-lived and the GC runs normally. A heap dump revealed thousands of live `byte[]` instances all rooted through `CancellationToken` registration chains — long after the chunks were supposed to be discarded.

The team confirmed the `CancellationToken` is never cancelled during normal operation (only on graceful shutdown), so no callback ever fires, but the registrations are never removed either. The leak only appears in the long-running service; the unit tests process only a handful of chunks and exit before memory pressure becomes visible.

## Buggy code

```csharp
public class ChunkProcessor : IDisposable
{
    private readonly NativeLibWrapper _native;
    private bool _disposed;

    public ChunkProcessor(NativeLibWrapper native)
    {
        _native = native;
    }

    public async Task ProcessAsync(byte[] chunk, CancellationToken ct)
    {
        // Register a callback so that if cancellation is requested, the
        // in-progress native call is aborted immediately.
        ct.Register(() =>
        {
            // chunk is captured here so we can pass it to the abort routine
            _native.Abort(chunk);
        });

        await Task.Run(() => _native.Process(chunk), ct);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _native.Dispose();
    }
}
```
