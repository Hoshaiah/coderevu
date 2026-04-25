---
slug: disposal-finalizer-suppress-missing
track: csharp
orderIndex: 38
title: Missing GC.SuppressFinalize in Dispose
difficulty: hard
tags:
  - disposal
  - performance
  - finalization
language: csharp
---

## Context

This class lives in `Native/AudioCapture.cs`. It wraps a native audio capture handle obtained via P/Invoke. The class implements the standard `IDisposable` pattern with a finalizer as a safety net for callers that forget to dispose. Instances are created and disposed thousands of times per session in a real-time audio pipeline.

Performance profiling shows that the GC finalizer thread is consuming 15–20% of CPU time under load, despite all callers correctly wrapping instances in `using` blocks. The finalizer queue depth metric (visible via `GC.GetGCMemoryInfo()` and a custom ETW listener) grows proportionally with instance creation rate. Memory pressure is low and GC collections are infrequent, ruling out a collection-frequency issue.

The team used a memory profiler and confirmed that every instance that is `Dispose`d by a `using` block still ends up on the finalization queue. They expected the finalizer to be suppressed after an explicit `Dispose` call, but it isn't.

## Buggy code

```csharp
public sealed class AudioCapture : IDisposable
{
    private IntPtr _handle;
    private bool _disposed;

    public AudioCapture()
    {
        _handle = NativeMethods.OpenCaptureDevice();
        if (_handle == IntPtr.Zero)
            throw new InvalidOperationException("Failed to open audio capture device.");
    }

    ~AudioCapture()
    {
        Dispose(false);
    }

    public void Dispose()
    {
        Dispose(true);
    }

    private void Dispose(bool disposing)
    {
        if (_disposed) return;
        _disposed = true;

        if (_handle != IntPtr.Zero)
        {
            NativeMethods.CloseCaptureDevice(_handle);
            _handle = IntPtr.Zero;
        }
    }

    public void Start() => NativeMethods.StartCapture(_handle);
    public void Stop()  => NativeMethods.StopCapture(_handle);
}
```
