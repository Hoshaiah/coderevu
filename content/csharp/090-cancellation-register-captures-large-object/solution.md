## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Token Registration Roots Large Buffer
// ------------------------------------------------------------------------

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
        // CHANGE 1: Store the registration returned by ct.Register so it can be disposed after processing, releasing the captured chunk reference and ending the GC root.
        // CHANGE 2: Use the state-object overload of Register so chunk is passed as explicit state rather than being closed over in a heap-allocated delegate, avoiding an extra hidden reference.
        using (ct.Register(
            state => _native.Abort((byte[])state!),
            state: chunk))
        {
            await Task.Run(() => _native.Process(chunk), ct);
        } // CHANGE 1: Dispose() on CancellationTokenRegistration is called here, unregistering the callback and releasing the root on chunk.
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _native.Dispose();
    }
}
```

## Explanation

### Issue 1: Registration Never Disposed, Roots Buffer

**Problem:** Every call to `ProcessAsync` calls `ct.Register(...)` and discards the returned `CancellationTokenRegistration`. The `CancellationToken`'s internal linked list holds a reference to the callback delegate, which closes over `chunk`. Because the registration is never removed, the token keeps every `chunk` array alive for the entire lifetime of the service — the heap dump shows thousands of live `byte[]` instances rooted through the token chain.

**Fix:** Wrap the `CancellationTokenRegistration` returned by `ct.Register` in a `using` block so `Dispose()` is called after `Task.Run` completes. This unregisters the callback and removes the GC root on the captured `chunk`.

**Explanation:** `CancellationToken` is backed by a `CancellationTokenSource` that keeps a list of registered callbacks. Each `Register` call appends a node containing the delegate. Until `CancellationTokenRegistration.Dispose()` is called (or the source is cancelled/disposed), that node stays in the list. The delegate here closes over `chunk`, so the GC sees the token → list node → delegate → `chunk` reference chain and marks the array reachable. Because the token is never cancelled in normal operation, the list grows unboundedly — one entry per processed chunk. Disposing the registration removes the node from the list immediately, so the next GC cycle can collect `chunk`. A related pitfall: if the source itself is disposed at shutdown, all registrations are cleared, which is why the leak only surfaces in long-running production runs rather than short test runs.

---

### Issue 2: Closure Captures chunk Instead of Using State Parameter

**Problem:** The original lambda `() => { _native.Abort(chunk); }` causes the compiler to generate a heap-allocated closure object that holds a reference to `chunk`. Even after the `using` fix lands, using a closure is slightly wasteful because it allocates an extra object per `ProcessAsync` call at high chunk throughput.

**Fix:** Replace the parameterless lambda with the `ct.Register(Action<object?> callback, object? state)` overload, passing `chunk` as the explicit `state` argument and casting it inside the callback. This is `CHANGE 2` in `ProcessAsync`.

**Explanation:** When the compiler sees a lambda that captures a local variable, it emits a hidden class whose field holds that variable, and allocates an instance on the heap each time the lambda is created. The `Register(Action<object?>, object?)` overload stores `state` directly in the registration node that already exists, so no extra allocation is needed. In a service processing thousands of chunks this reduces GC pressure noticeably. The cast inside the callback (`(byte[])state!`) is safe because `chunk` is always a `byte[]` and the callback is only ever invoked from within this method's `using` scope.
