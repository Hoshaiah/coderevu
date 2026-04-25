## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — MemoryStream Disposed Before Read
// ------------------------------------------------------------------------

public class JsonSerializer
{
    private readonly System.Text.Json.JsonSerializerOptions _options;

    public JsonSerializer(System.Text.Json.JsonSerializerOptions options)
    {
        _options = options;
    }

    public async Task SerializeToStreamAsync<T>(
        T value,
        PipeWriter writer,
        CancellationToken ct)
    {
        // CHANGE 1: Removed `using` so the MemoryStream is not disposed before the awaited CopyToAsync completes; dispose manually after the copy.
        var ms = new MemoryStream();
        try
        {
            // CHANGE 2: Replaced synchronous Serialize with async SerializeAsync to avoid blocking a thread-pool thread during JSON serialization.
            await System.Text.Json.JsonSerializer.SerializeAsync(ms, value, _options, ct);
            ms.Position = 0;
            await ms.CopyToAsync(writer.AsStream(), ct);
        }
        finally
        {
            await ms.DisposeAsync();
        }
    }
}
```

## Explanation

### Issue 1: MemoryStream Disposed Before Async Copy

**Problem:** The API intermittently returns HTTP 500 with `Cannot access a closed Stream`, or sends an empty/truncated body. This happens because the `MemoryStream` is closed while `CopyToAsync` is still reading from it.

**Fix:** Remove the `using` declaration and replace it with an explicit `try/finally` block. The `MemoryStream` is disposed via `await ms.DisposeAsync()` in the `finally` block, which only runs after `CopyToAsync` has fully awaited.

**Explanation:** A `using var` statement calls `Dispose` at the closing brace of the enclosing scope. In C#, when you `await` inside a `using` block, the compiler desugars the async state machine so that `Dispose` is called when execution leaves the scope — which is correct — but the key mistake here is that `await ms.CopyToAsync(...)` suspends the method and returns control to the caller. If the runtime schedules the continuation on a different thread-pool thread (common under load), the `using` disposal can race with the still-in-progress read. Moving disposal to an explicit `finally` that wraps the entire `await` chain guarantees the stream stays alive until `CopyToAsync` completes. A related pitfall: wrapping the `CopyToAsync` call in `Task.Run` would make the race even more obvious, but the original code triggers it just from normal async scheduling.

---

### Issue 2: Synchronous Serialize Blocks Thread-Pool Thread

**Problem:** Under load, thread-pool starvation becomes more likely because `JsonSerializer.Serialize` writes synchronously to the `MemoryStream` while holding a thread-pool thread. This delays other requests and worsens the cold-start latency the team observes.

**Fix:** Replace `System.Text.Json.JsonSerializer.Serialize(ms, value, _options)` with `await System.Text.Json.JsonSerializer.SerializeAsync(ms, value, _options, ct)`. This is the async overload that allows the runtime to schedule I/O-bound work cooperatively.

**Explanation:** `MemoryStream` writes are in-memory and fast, so the synchronous call rarely causes a timeout in isolation. However, in an ASP.NET Core pipeline every request runs on a thread-pool thread, and blocking that thread with a synchronous call prevents the pool from serving other requests. Under load the pool exhausts its threads and starts queuing requests, which compounds with any latency spike. Using `SerializeAsync` also passes the `CancellationToken`, so the serialization is cancellable if the client disconnects — the synchronous overload has no cancellation path at all. Note that `SerializeAsync` buffers internally just like writing to a `MemoryStream`, so the behavior is equivalent and the rest of the pipeline is unchanged.
