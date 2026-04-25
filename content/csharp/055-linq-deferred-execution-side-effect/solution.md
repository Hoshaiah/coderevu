## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — LINQ Deferred Execution Mutates Twice
// ------------------------------------------------------------------------

public class OrderProcessor
{
    private readonly IOrderRepository _repo;
    private readonly ILogger<OrderProcessor> _logger;

    public OrderProcessor(IOrderRepository repo, ILogger<OrderProcessor> logger)
    {
        _repo = repo;
        _logger = logger;
    }

    public async Task ProcessBatchAsync(IEnumerable<Order> orders, decimal discountRate)
    {
        // CHANGE 1: Materialize the projection immediately with ToList() so the Select body executes exactly once, preventing double-discount from a second enumeration in SaveAllAsync.
        // CHANGE 2: Create a new Order copy instead of mutating the incoming object in-place, so the caller's original list is not modified as a side-effect.
        var discounted = orders.Select(o => new Order
        {
            Id = o.Id,
            Total = o.Total * (1 - discountRate)
        }).ToList();

        foreach (var order in discounted)
        {
            _logger.LogInformation("Order {Id} adjusted to {Total}", order.Id, order.Total);
        }

        await _repo.SaveAllAsync(discounted);
    }
}
```

## Explanation

### Issue 1: Deferred LINQ re-executes mutation twice

**Problem:** A fraction of orders are saved with their total discounted twice (e.g., a $100 order with a 10% discount ends up at $81 instead of $90). This happens every time `discounted` is iterated more than once — which the original code does: once in `foreach` and once inside `SaveAllAsync`.

**Fix:** Add `.ToList()` at the end of the `Select` call to materialize the sequence immediately into a `List<Order>`. The `Select` lambda now runs exactly once per order, and both the `foreach` and `SaveAllAsync` read from the already-computed list.

**Explanation:** `IEnumerable<T>` returned by `Select` is lazy: every time you call `foreach` or pass it to a method that iterates it, the lambda runs again from scratch. In the original code, `discounted` is an unevaluated query. The `foreach` loop walks it (running the mutation lambda on each order), then `SaveAllAsync` walks it again (running the mutation lambda a second time on the same objects). Because `o.Total *= ...` writes back to the same `Order` instance, the second pass multiplies an already-reduced total again. Calling `.ToList()` forces a single pass through the lambda and stores the results, so every subsequent read just pulls from that in-memory list without re-executing any code. A related pitfall: if `SaveAllAsync` internally iterates the sequence multiple times (e.g., once to count, once to insert), without `.ToList()` you would see triple or more discounts.

---

### Issue 2: In-place mutation of caller-owned objects

**Problem:** Even if the double-enumeration bug did not exist, the original `Select` lambda does `o.Total *= (1 - discountRate)`, which modifies the `Order` object that was passed in by the caller. After `ProcessBatchAsync` returns, the caller's original list contains the discounted totals, not the originals they passed in. This is a hidden side-effect that makes the method hard to reason about and can corrupt state in tests or in code that reuses the same order objects.

**Fix:** Replace the in-place mutation with `new Order { Id = o.Id, Total = o.Total * (1 - discountRate) }` inside the `Select` lambda, creating a fresh object for each discounted order while leaving the source object unchanged.

**Explanation:** When `orders` is a `List<Order>` (or any collection of reference-type objects), each `o` inside `Select` is a reference to the same heap object the caller holds. Writing `o.Total *= ...` changes the object through that reference, so the caller immediately sees the modified total — no copy was made. By constructing a new `Order` inside the lambda, the projection produces independent objects that the processor owns. The caller's originals are untouched. This also makes the double-enumeration bug more visible during debugging, because without the mutation the lambda is a pure transformation and re-running it just recomputes the same value rather than compounding changes. If `Order` has many properties, a common alternative is to implement a `Clone()` method or use a record type so that all fields are copied without listing each one explicitly.
