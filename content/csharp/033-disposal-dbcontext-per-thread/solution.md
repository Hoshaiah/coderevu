## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — DbContext Shared Across Threads
// ------------------------------------------------------------------------

using Microsoft.Extensions.DependencyInjection;

public class OrderSyncWorker : BackgroundService
{
    private readonly IOrderApiClient _api;
    // CHANGE 3: Inject IServiceScopeFactory instead of AppDbContext directly so each sync cycle can create its own scope and get a fresh DbContext, avoiding the shared-scoped-context lifetime problem.
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderSyncWorker> _logger;

    public OrderSyncWorker(
        IOrderApiClient api,
        // CHANGE 3: Replace AppDbContext constructor parameter with IServiceScopeFactory — BackgroundService lives as a singleton, so it must not hold a scoped DbContext directly.
        IServiceScopeFactory scopeFactory,
        ILogger<OrderSyncWorker> logger)
    {
        _api = api;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var orders = await _api.FetchPendingAsync(stoppingToken);

            // CHANGE 1: Replace Parallel.ForEachAsync with a sequential async foreach so each order is processed one at a time, eliminating concurrent access to a single DbContext instance.
            foreach (var order in orders)
            {
                // CHANGE 2: Create a new DI scope per order so each iteration gets its own DbContext instance, keeping the change-tracker isolated and preventing cross-task state corruption.
                await using var scope = _scopeFactory.CreateAsyncScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var existing = await dbContext.Orders
                    .FirstOrDefaultAsync(o => o.Id == order.Id, stoppingToken);

                if (existing is null)
                    dbContext.Orders.Add(new Order(order));
                else
                    existing.UpdateFrom(order);

                // CHANGE 2: SaveChangesAsync is now called on the per-order scoped DbContext, so only that order's changes are flushed and the context is disposed cleanly when the scope exits.
                await dbContext.SaveChangesAsync(stoppingToken);
            }

            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }
}
```

## Explanation

### Issue 1: Concurrent DbContext Access Across Parallel Tasks

**Problem:** `Parallel.ForEachAsync` runs multiple lambda iterations concurrently on the same `_dbContext` instance. EF Core's `DbContext` is explicitly documented as not thread-safe. When two tasks both call `FirstOrDefaultAsync` or `Add` at overlapping times, EF detects the overlap and throws `InvalidOperationException: A second operation was started on this context instance before a previous operation completed`.

**Fix:** Replace `Parallel.ForEachAsync` with a sequential `foreach` loop so only one database operation runs at a time against any given `DbContext` instance.

**Explanation:** EF Core maintains internal state — the change tracker, active command handles, and connection state — inside a single `DbContext` instance. When two `async` continuations both try to advance an operation on that shared state, EF's guard throws rather than silently corrupt data. The error appears in bursts under high volume because low volume means fewer parallel tasks and fewer overlapping operations, making the race intermittent. Sequential processing eliminates the race entirely. If throughput matters, a correct parallel approach requires one `DbContext` per task, not one shared across all tasks.

---

### Issue 2: SaveChangesAsync Inside Parallel Loop Corrupts Change Tracker

**Problem:** Each concurrent task calls `_dbContext.SaveChangesAsync`, which flushes *all* pending changes tracked by that shared context at the moment it is called. One task's `SaveChangesAsync` can therefore persist another task's partially-built `Order` entity before `UpdateFrom` has finished, or it can attempt to save an entity whose backing scope has already been disposed.

**Fix:** Move `DbContext` creation inside the loop using a per-iteration `IServiceScope` (via `_scopeFactory.CreateAsyncScope()`), then call `SaveChangesAsync` on that isolated `dbContext` instance before the scope is disposed with `await using`.

**Explanation:** The EF change tracker is not partitioned by caller — every `Add` or modification goes into one shared queue inside the `DbContext`. When multiple concurrent tasks push entities into that queue and each tries to call `SaveChangesAsync`, the calls race: one save may include entities that were added by a different task mid-construction, producing duplicate inserts, missing updates, or constraint violations. Giving each iteration its own `DbContext` means the change tracker holds exactly the entities that iteration touched, so `SaveChangesAsync` does only the expected work.

---

### Issue 3: Scoped DbContext Injected Into Singleton BackgroundService

**Problem:** `BackgroundService` is registered as a singleton by the ASP.NET Core host. When `AppDbContext` (scoped lifetime) is injected through the constructor, it is captured for the entire lifetime of the host process. The context never gets refreshed, holds a single database connection open indefinitely, and accumulates stale change-tracker entries across every sync cycle.

**Fix:** Replace the `AppDbContext` constructor parameter with `IServiceScopeFactory`, then call `_scopeFactory.CreateAsyncScope()` inside the execution loop to resolve a fresh `AppDbContext` per iteration. This is the standard pattern for consuming scoped services from singletons.

**Explanation:** ASP.NET Core's DI container does not warn by default when a scoped service is captured by a singleton (unless scope validation is enabled). The captured `DbContext` keeps its connection open and its change tracker loaded with entities from previous cycles. Over time this causes tracked-entity count to grow, slows queries, and can cause `ObjectDisposedException` if the underlying connection is reclaimed by the pool while the singleton still holds a reference. Creating a scope per cycle gives you a properly-lifetime-managed context each time, and `await using` ensures deterministic disposal when the scope exits.
