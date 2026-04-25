---
slug: async-fire-and-forget-not-awaited
track: csharp
orderIndex: 11
title: Background Work Silently Abandoned
difficulty: medium
tags:
  - async
  - task
  - error-handling
language: csharp
---

## Context

This code lives in `OrderService.cs`, the command handler for placing orders in an ASP.NET Core API. After persisting the order, the service enqueues an audit event to an external analytics pipeline. The audit path is considered non-critical — if it fails, the order should still be considered placed — so it was intentionally made fire-and-forget.

The analytics team reports that audit events are missing for roughly 3–5% of orders during high load. No exceptions appear in the structured logs. A developer added a breakpoint inside `_audit.RecordAsync` and confirmed the method is entered, but sometimes exits via an unhandled exception that disappears with no trace.

The operations team tried wrapping the call in `Task.Run` thinking it was a thread issue, which made no difference. The real cause is that the calling code creates a task but provides no mechanism to observe its result.

## Buggy code

```csharp
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

        // Fire-and-forget: audit is non-critical
        _audit.RecordAsync(order.Id, AuditEvent.OrderPlaced);

        return new OrderResult(order.Id, OrderStatus.Confirmed);
    }
}
```
