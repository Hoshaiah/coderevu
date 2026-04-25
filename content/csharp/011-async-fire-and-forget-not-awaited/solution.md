## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Background Work Silently Abandoned
// ------------------------------------------------------------------------

public class OrderService
{
    private readonly IOrderRepository _orders;
    private readonly IAuditService _audit;
    private readonly ILogger<OrderService> _logger;

    public OrderService(
        IOrderRepository orders,
        IAuditService audit,
        ILogger<OrderService> logger)
    {
        _orders = orders;
        _audit  = audit;
        _logger = logger;
    }

    public async Task<OrderResult> PlaceOrderAsync(
        OrderRequest request,
        CancellationToken ct)
    {
        var order = await _orders.SaveAsync(request, ct);

        // CHANGE 1: Attach a ContinueWith continuation so the Task is observed; without this, any exception thrown inside RecordAsync is silently discarded by the runtime.
        // CHANGE 2: Log the exception inside the continuation so failures appear in structured logs instead of disappearing with no trace.
        _ = _audit.RecordAsync(order.Id, AuditEvent.OrderPlaced)
                  .ContinueWith(
                      t => _logger.LogError(
                          t.Exception,
                          "Audit recording failed for order {OrderId}; event may be missing from analytics pipeline.",
                          order.Id),
                      TaskContinuationOptions.OnlyOnFaulted);

        return new OrderResult(order.Id, OrderStatus.Confirmed);
    }
}
```

## Explanation

### Issue 1: Unobserved Task Exception Silently Discarded

**Problem:** `_audit.RecordAsync` returns a `Task` but the calling code never stores, awaits, or attaches a continuation to it. When the task faults, the exception has no observer, so the .NET runtime discards it. The audit event vanishes with no log entry, no crash, and no visible signal — matching exactly what the analytics team and the debugger breakpoint both showed.

**Fix:** The return value of `_audit.RecordAsync(...)` is now assigned to a discard (`_ = ...`) and chained with `.ContinueWith(...)` using `TaskContinuationOptions.OnlyOnFaulted`. This attaches an observer for the faulted case without blocking the caller.

**Explanation:** In .NET, a `Task` carries its exception in its `Exception` property. If nothing ever reads that property — by awaiting, by calling `.Wait()`, or by attaching a continuation — the runtime considers the exception unobserved. Prior to .NET 4.5, unobserved exceptions crashed the process; from 4.5 onward the runtime silently swallows them, which is exactly the failure mode here. Assigning the task to `_` is a style signal to the compiler that the discard is intentional, suppressing the CS4014 warning. The `ContinueWith` call runs only when the antecedent task transitions to the `Faulted` state, so the happy path adds no overhead. One related pitfall: if `RecordAsync` throws synchronously before returning a task (e.g., a `null` argument guard), none of this helps — you would need a try/catch around the call site too, but that is outside the reported failure mode.

---

### Issue 2: Audit Failures Produce No Log Entry

**Problem:** Even if the intent was always fire-and-forget, the original code provides no logging when the audit call fails. The operations team sees 3–5% missing events but has no correlated log line to diagnose the root cause, frequency, or which order IDs are affected.

**Fix:** Inside the `ContinueWith` continuation, `_logger.LogError(t.Exception, ...)` is called with the faulted task's exception and the `order.Id` as a structured parameter, so every failed audit attempt produces a searchable log entry.

**Explanation:** Fire-and-forget does not mean "ignore failures"; it means "don't block the caller". Logging inside the continuation costs nothing on the success path because `TaskContinuationOptions.OnlyOnFaulted` prevents the delegate from running at all when the task succeeds. `t.Exception` on a faulted task is an `AggregateException` wrapping the real cause; `LogError` accepts it directly and most structured logging sinks (Serilog, Application Insights) will unwrap and index the inner exceptions. Without this, a transient network error inside `RecordAsync` looks identical to a successful call from the caller's perspective, making it impossible to distinguish a bug from expected load-shedding behavior.
