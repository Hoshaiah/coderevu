## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Missing GC.SuppressFinalize in Dispose
// ------------------------------------------------------------------------

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
        // CHANGE 1: Tell the GC the finalizer does not need to run because we already cleaned up; without this every instance stays on the finalizer queue even after explicit Dispose.
        GC.SuppressFinalize(this);
    }

    private void Dispose(bool disposing)
    {
        if (_disposed) return;
        _disposed = true;

        // CHANGE 2: Guard managed-resource cleanup behind the disposing flag so that if this path is reached from the finalizer, only unmanaged resources are released (managed objects may already be collected).
        if (disposing)
        {
            // Release managed resources here if any are added in the future.
        }

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

## Explanation

### Issue 1: Missing GC.SuppressFinalize call

**Problem:** Every `AudioCapture` instance that is explicitly `Dispose`d — including all those inside `using` blocks — still ends up on the GC finalizer queue. The finalizer thread runs `Dispose(false)` on each one, even though cleanup already happened. Profiling shows the finalizer thread consuming 15–20% CPU, and the queue depth grows linearly with instance creation rate.

**Fix:** Add `GC.SuppressFinalize(this)` as the last statement in the public `Dispose()` method, immediately after calling `Dispose(true)`.

**Explanation:** When the CLR constructs any object that has a finalizer (`~AudioCapture`), it automatically registers that object with the finalization queue. The object stays registered until someone explicitly calls `GC.SuppressFinalize`. If `Dispose()` never calls `GC.SuppressFinalize`, the GC will invoke the finalizer on every instance regardless of whether `Dispose` already ran. In this codebase, all callers use `using` blocks, so `Dispose()` runs correctly — but the finalizer runs anyway, making a second (harmless but expensive) pass through `Dispose(bool)`. The `_disposed` guard prevents double-free, but the finalizer thread still wakes up, dequeues the object, and calls the method for every single instance. Adding `GC.SuppressFinalize(this)` removes the object from the queue at `Dispose` time, so the finalizer thread has nothing to process.

---

### Issue 2: disposing parameter ignored in Dispose(bool)

**Problem:** The `disposing` parameter is accepted but never checked. The method treats a finalizer-initiated call (`disposing == false`) identically to a caller-initiated call (`disposing == true`). This is benign right now because there are no managed `IDisposable` fields, but it is a latent defect: adding any managed resource later without also adding the guard would cause the finalizer path to dispose managed objects that the GC may already be collecting.

**Fix:** Wrap any managed-resource cleanup inside `if (disposing) { ... }` inside `Dispose(bool)`, leaving unmanaged handle cleanup (`NativeMethods.CloseCaptureDevice`) outside that guard so it runs from both paths.

**Explanation:** The `bool disposing` flag exists precisely to split cleanup into two categories. When `disposing` is `true`, the call comes from explicit `Dispose()`, and it is safe to call `Dispose()` on other managed objects. When `disposing` is `false`, the call comes from the finalizer, and managed objects may already have been finalized or collected — touching them is unsafe. The current code ignores the flag, so if a `StreamWriter` or similar managed field were added and disposed inside `Dispose(bool)`, the finalizer path would attempt to access it after the GC may have already finalized it, producing non-deterministic failures. Adding the `if (disposing)` guard is the standard defense against this class of error.
