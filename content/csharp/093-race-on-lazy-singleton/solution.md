## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Non-thread-safe lazy initialisation produces duplicate singletons under concurrent requests
// ------------------------------------------------------------------------
public class LookupTableService
{
    private readonly IDbConnectionFactory _db;
    private static LookupTable? _cache;
    // CHANGE 3: Added a dedicated sync-root object so the lock target is explicit and never accidentally replaced or exposed outside this class.
    private static readonly SemaphoreSlim _initLock = new SemaphoreSlim(1, 1);

    public LookupTableService(IDbConnectionFactory db)
    {
        _db = db;
    }

    public async Task<LookupTable> GetTableAsync()
    {
        // CHANGE 2: Read through Volatile.Read so the JIT/CPU cannot cache a stale null from before another thread's write becomes visible.
        if (Volatile.Read(ref _cache) != null)
            return _cache!;

        // CHANGE 1: Acquire an async-compatible lock so only one caller runs LoadFromDatabaseAsync; all others wait and then reuse the result.
        await _initLock.WaitAsync();
        try
        {
            // CHANGE 1 (inner check): Re-test after acquiring the lock because another
            // waiter may have already populated _cache while we were queued.
            if (Volatile.Read(ref _cache) != null)
                return _cache!;

            Console.WriteLine("Loading lookup table from database...");
            var table = await LoadFromDatabaseAsync();
            // CHANGE 2: Write through Volatile.Write so the assignment is immediately visible to all cores before the lock is released.
            Volatile.Write(ref _cache, table);
            return _cache!;
        }
        finally
        {
            _initLock.Release();
        }
    }

    private async Task<LookupTable> LoadFromDatabaseAsync()
    {
        await Task.Delay(500); // simulate DB round-trip
        return new LookupTable();
    }
}
```

## Explanation

### Issue 1: Missing async-safe double-checked locking

**Problem:** Under concurrent startup traffic, many threads call `GetTableAsync` before `_cache` is populated. Each one passes the `if (_cache != null)` guard simultaneously, then each independently awaits `LoadFromDatabaseAsync`. The log line appears multiple times and each caller stores its own separate `LookupTable` instance into `_cache`, so different request threads hold references to different objects.

**Fix:** A `SemaphoreSlim(1,1)` named `_initLock` is added. `GetTableAsync` now calls `await _initLock.WaitAsync()` and then re-checks `_cache` inside the lock before calling `LoadFromDatabaseAsync`. The `finally` block releases the semaphore unconditionally.

**Explanation:** The original code has a time-of-check / time-of-use gap: reading `_cache`, deciding it is null, and writing it are three separate non-atomic steps. Any number of threads can pass the read step before any of them finishes the write step. `SemaphoreSlim` serialises entry to the critical section without blocking a thread-pool thread (unlike `lock`, it is awaitable). The inner re-check after acquiring the semaphore is essential: the second thread to reach `WaitAsync` would otherwise still see the null it observed before waiting and would call `LoadFromDatabaseAsync` again. Omitting that inner check would make the semaphore pointless.

---

### Issue 2: No memory-visibility guarantee on static field write

**Problem:** On multi-core hardware, the CPU or JIT may reorder or cache the write to `_cache`. A thread that just called `Volatile.Write` / plain assignment may see the new value while a concurrent reader on another core still reads null from its cache line, even moments after the write completes.

**Fix:** `Volatile.Read(ref _cache)` is used at every read site and `Volatile.Write(ref _cache, table)` is used at the single write site. These replace the plain field reads (`_cache != null`) and the plain assignment (`_cache = table`).

**Explanation:** The C# memory model does not guarantee that a plain field write is immediately visible across cores without a memory barrier. `volatile` on the field declaration or `Volatile.Read`/`Volatile.Write` inserts the necessary acquire and release fences. Without the fence, the outer null-check could return false on one core while another core has already written the value, causing an extra unnecessary load. The `Volatile.Write` before releasing the semaphore also ensures any thread that acquires the semaphore next sees the fully constructed `LookupTable` and not a partially initialised object.

---

### Issue 3: Implicit static state in a non-singleton service

**Problem:** `_cache` is a `static` field, meaning it lives on the type rather than the instance. If `LookupTableService` is registered as scoped or transient (common in ASP.NET Core DI), every new instance silently shares the same cache, which is not visible from the constructor signature or the DI registration. This makes testing and lifetime management error-prone.

**Fix:** A `static readonly SemaphoreSlim _initLock` is added alongside `_cache` to make the static ownership explicit and documented. This change also signals to a reviewer that the author consciously chose a static (process-lifetime) cache, rather than letting it happen accidentally.

**Explanation:** When a field is static on a class registered as transient or scoped, the cache outlives individual service instances but nothing in the DI container enforces or documents this. A developer adding a test might create a fresh `LookupTableService` expecting a clean state and be surprised that `_cache` still holds the previous run's data. The minimal fix here is to make the static intent explicit through the lock object and a comment; a more thorough fix would register the service as a singleton in the DI container so the lifetime is enforced externally rather than hidden inside a static field.
