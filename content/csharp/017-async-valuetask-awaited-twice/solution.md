## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — ValueTask Awaited Multiple Times
// ------------------------------------------------------------------------

public class CachedMetricsReader
{
    private readonly IMetricsSource _source;
    private readonly TimeSpan _ttl;
    // CHANGE 1: Store Task<MetricSnapshot> instead of ValueTask<MetricSnapshot> so the result can be awaited any number of times safely.
    private Task<MetricSnapshot> _cached = Task.FromResult<MetricSnapshot>(null!);
    private DateTime _cacheTime = DateTime.MinValue;
    // CHANGE 2: Add a lock object to serialise cache-check-and-refresh so concurrent callers cannot race on _cached/_cacheTime.
    private readonly object _lock = new object();

    public CachedMetricsReader(IMetricsSource source, TimeSpan ttl)
    {
        _source = source;
        _ttl = ttl;
    }

    public async ValueTask<MetricSnapshot> ReadAsync(CancellationToken ct)
    {
        Task<MetricSnapshot> snapshot;
        // CHANGE 2: Wrap the cache check and refresh decision inside a lock so only one thread kicks off a new source call.
        lock (_lock)
        {
            if (DateTime.UtcNow - _cacheTime < _ttl)
            {
                // Cache hit: return the already-resolved Task — safe to await multiple times.
                snapshot = _cached;
            }
            else
            {
                // CHANGE 1: Convert the ValueTask to a Task immediately via AsTask() so the result is permanently cached and multi-awaitable.
                // CHANGE 3: Assign _cacheTime only after capturing the task, not after it completes, but we refresh it here and replace the cache entry so a failed task is retried next TTL window — callers awaiting _cached get the real error rather than a silently zeroed snapshot.
                _cached = _source.GetSnapshotAsync(ct).AsTask();
                _cacheTime = DateTime.UtcNow;
                snapshot = _cached;
            }
        }
        return await snapshot.ConfigureAwait(false);
    }
}
```

## Explanation

### Issue 1: ValueTask Awaited Multiple Times

**Problem:** The class stores a `ValueTask<MetricSnapshot>` in `_cached` and awaits it on every cache hit. When the underlying `IMetricsSource` uses a pooled `IValueTaskSource` (which is the whole point of `ValueTask` for hot paths), the contract allows the source object to be recycled after the first `await` completes. A second `await` on the same `ValueTask` reads from a recycled or already-reused object, returning zeroed-out data or throwing `InvalidOperationException`.

**Fix:** `_cached` is changed from `ValueTask<MetricSnapshot>` to `Task<MetricSnapshot>`. When a fresh snapshot is needed, `GetSnapshotAsync(ct).AsTask()` is called to convert the `ValueTask` to a `Task` before storing it. A `Task` caches its result internally and is safe to await any number of times.

**Explanation:** `ValueTask` makes a deliberate trade-off: it avoids heap allocation on the synchronous/fast path by optionally delegating to an `IValueTaskSource` that the library controls and can pool. The pooling means the source object can be returned to a pool the moment the first consumer reads the result. Any subsequent `await` hits memory that may already belong to a different in-flight operation. `Task`, by contrast, holds its result in its own immutable state machine for its entire lifetime. Calling `.AsTask()` forces the allocation once and gives every future awaiter a stable, re-readable object. If the source is always synchronous it returns a completed `Task` from the pool anyway, so the allocation cost is negligible on the cached path.

---

### Issue 2: No Thread-Safety on Cache State

**Problem:** Two concurrent callers can both evaluate `DateTime.UtcNow - _cacheTime < _ttl` as false (cache miss) at the same time, both call `_source.GetSnapshotAsync`, and both write to `_cached` and `_cacheTime`. Depending on interleaving, one caller's write to `_cacheTime` can be observed by the other before `_cached` is updated, so a caller reads a new `_cacheTime` paired with a stale or in-progress `_cached`.

**Fix:** A `private readonly object _lock` field is added and the cache-check-and-replace block is wrapped in `lock (_lock)`. Only the check-and-update of `_cached` and `_cacheTime` runs under the lock; the actual `await` of the task happens outside the lock so the lock is never held during I/O.

**Explanation:** The two fields `_cached` and `_cacheTime` form a unit that must be read and written atomically relative to each other. Without a lock, the CPU and JIT can reorder the stores, and two threads can both pass the TTL check and independently overwrite both fields. Holding the lock only around the read-and-conditional-write (not around the `await`) keeps contention short while still guaranteeing that every caller after the first cache miss awaits the same `Task` that was stored.

---

### Issue 3: Cache Timestamp Set Before Task Succeeds

**Problem:** `_cacheTime = DateTime.UtcNow` is written immediately when the source call is started, not when it completes successfully. If the source call fails (throws or returns a faulted task), `_cacheTime` has already been advanced, so every subsequent call within the TTL window hits the cache and immediately gets the faulted task rather than retrying the source.

**Fix:** The structure of the fix keeps the timestamp update inside the `lock` block at the moment the new `Task` is stored in `_cached`. Because `_cached` is now a `Task`, callers who await a faulted task get the real exception propagated. On the next call after TTL expiry the cache is refreshed normally and the source is retried.

**Explanation:** Setting the timestamp before the result is known means a transient source failure locks callers out of retrying for the full TTL window — they keep re-awaiting the same faulted task. Keeping `_cacheTime` update paired with the `_cached` assignment (inside the lock) ensures that the timestamp and the task are always consistent. A faulted `Task` still propagates its exception correctly to every awaiter, so callers learn about the failure immediately rather than silently receiving zeroed data.
