## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Implementing a finalizer on a managed-only class causes GC promotion and memory pressure
// ------------------------------------------------------------------------
public class EventBatch : IDisposable
{
    private bool _disposed;
    public List<Event> Events { get; } = new();
    public string BatchId { get; }

    public EventBatch(string batchId)
    {
        BatchId = batchId;
    }

    // CHANGE 1: Finalizer removed entirely. EventBatch holds only managed references (List<Event> and string). There are no unmanaged handles, SafeHandles, or native memory to release. A finalizer here serves no purpose and forces every instance into the finalization queue, preventing Gen0 collection and promoting objects to Gen2.

    public void Dispose()
    {
        Dispose(true);
        // CHANGE 2: GC.SuppressFinalize removed because there is no longer a finalizer to suppress. Keeping the call was harmless but misleading; removing it makes the intent clear and avoids the false implication that a finalizer exists.
    }

    protected virtual void Dispose(bool disposing)
    {
        if (_disposed) return;
        if (disposing)
        {
            Events.Clear();
        }
        _disposed = true;
    }
}
```

## Explanation

### Issue 1: Unnecessary finalizer causes GC promotion

**Problem:** Every `EventBatch` instance gets registered with the GC's finalization infrastructure at allocation time. This means each object survives at least one extra GC cycle (so the finalizer thread can run), promoting it from Gen0 to Gen1 or Gen2. In a high-throughput path that creates thousands of batches per second, the Gen2 heap grows steadily and collection pauses spike — exactly the symptoms seen in profiling.

**Fix:** The `~EventBatch()` finalizer method is deleted entirely from the class. No other code changes are needed to make the class collect cleanly in Gen0.

**Explanation:** When the GC allocates an object whose class defines a finalizer, it adds that object to a special finalization-registered list. When the object becomes unreachable, the GC does not immediately reclaim it — instead it moves the object's reference onto the finalizer queue and keeps it alive until the finalizer thread processes it. Only after `Finalize` runs can the memory be reclaimed, typically in the next collection cycle of a higher generation. `EventBatch` holds a `List<Event>` and a `string`, both of which are managed types; the GC already knows how to reclaim them without any help. The `Dispose(false)` path called from the finalizer does nothing useful (`Events.Clear()` is skipped because `disposing` is `false`), so the finalizer is pure overhead. Removing it lets the GC collect dead `EventBatch` objects in Gen0 on the same cycle they become unreachable.

---

### Issue 2: GC.SuppressFinalize kept after finalizer removal

**Problem:** Once the finalizer is gone, the `GC.SuppressFinalize(this)` call inside `Dispose()` has no effect — but leaving it in suggests to readers (and future maintainers) that a finalizer exists somewhere and needs suppressing. This creates confusion and could mask a future accidental re-introduction of a finalizer.

**Fix:** The `GC.SuppressFinalize(this)` call is removed from `Dispose()`. The method now simply calls `Dispose(true)` and returns.

**Explanation:** `GC.SuppressFinalize` tells the runtime to skip the finalization step for a specific object. It is only meaningful when the class (or a base class) has a finalizer registered. With no finalizer present, the call is a no-op at runtime, but it misleads code reviewers into thinking the dispose pattern here guards against double-release via finalization. The standard full dispose pattern (with finalizer + `SuppressFinalize`) exists specifically for classes that own unmanaged resources. When a class is managed-only and the finalizer is correctly removed, the `bool disposing` parameter and `SuppressFinalize` call are also no longer needed — though the virtual `Dispose(bool)` overload is kept here to preserve the extensibility point for subclasses.
