## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Null Platform Type in forEach
// ------------------------------------------------------------------------

import com.example.legacy.JavaOrderService
import com.example.legacy.Order

class OrderProcessor(
    private val service: JavaOrderService
) {
    fun processPending() {
        // CHANGE 1: Use the Elvis operator to treat a null list as an empty list, preventing NPE when the Java service returns null during maintenance mode.
        val orders = service.getPendingOrders() ?: emptyList<Order>()
        // CHANGE 2: Use filterNotNull() to drop any null elements the Java service may inject into the list, preventing a NPE inside processOrder when order.id is accessed.
        orders.filterNotNull().forEach { order ->
            processOrder(order)
        }
    }

    private fun processOrder(order: Order) {
        println("Processing order ${order.id}")
    }
}
```

## Explanation

### Issue 1: Null platform-type list crashes `forEach`

**Problem:** When the upstream Java service enters maintenance mode it returns `null` from `getPendingOrders()`. Kotlin sees the return type as the platform type `List<Order>!`, so the compiler does not enforce a null check. At runtime `orders` holds `null`, and calling `.forEach` on it throws a `NullPointerException` before a single order is processed.

**Fix:** Append `?: emptyList<Order>()` immediately after the `getPendingOrders()` call (the `// CHANGE 1` site). If the service returns `null`, the Elvis operator substitutes an empty `List<Order>`, so `forEach` iterates over zero elements without crashing.

**Explanation:** Kotlin's platform types are a compatibility bridge: the compiler trusts that the Java API won't return `null` because it has no nullability annotation to say otherwise. That trust is misplaced here. The `?:` operator is evaluated at runtime — if the left-hand side is `null`, Kotlin evaluates and returns the right-hand side instead. An empty list is the correct semantic: there are no orders to process, so iterating over nothing is exactly the right behavior. A related pitfall is asserting non-null with `!!` instead; that would throw an `IllegalStateException` with an even less informative stack trace, so always prefer a safe default or explicit null handling over `!!` on platform types.

---

### Issue 2: Null elements inside the list crash `processOrder`

**Problem:** Even when the list itself is non-null, individual elements returned by a Java API can be `null` at runtime. If any `Order` slot in the list is `null`, Kotlin passes that `null` reference into `processOrder`, and accessing `order.id` immediately throws a `NullPointerException`.

**Fix:** Chain `.filterNotNull()` on `orders` before `.forEach` (the `// CHANGE 2` site). This produces a `List<Order>` with all null entries removed, so the lambda body only ever receives a real `Order` instance.

**Explanation:** `List<Order>!` means the list's element type is also a platform type — each element is effectively `Order!`, meaning it can be `null` at runtime even though Kotlin treats it as non-null in the type system. `filterNotNull()` iterates the raw list and keeps only non-null items, returning a properly typed `List<Order>`. Silently dropping null orders may not always be correct — if tracking skipped orders matters, log a warning inside the filter or collect them separately — but it prevents the crash and is a safe default for a processor that is expected to handle degraded upstream data.
