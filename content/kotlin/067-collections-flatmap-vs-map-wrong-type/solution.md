## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — flatMap Returns Nested Lists
// ------------------------------------------------------------------------

data class LineItem(val productId: String, val price: Double)
data class Order(val id: String, val items: List<LineItem>)

fun expandOrders(orders: List<Order>): List<LineItem> {
    // CHANGE 1: Replace `map` with `flatMap` so each order's items list is flattened into a single List<LineItem> instead of producing a List<List<LineItem>>.
    // CHANGE 2: Remove the `@Suppress("UNCHECKED_CAST")` annotation and the unsafe `as List<LineItem>` cast — `flatMap` already returns the correct type so no cast is needed.
    return orders.flatMap { order ->
        order.items
    }
}

fun processBatch(orders: List<Order>) {
    val lineItems = expandOrders(orders)
    for (item in lineItems) {
        println("Billing item ${item.productId} at ${item.price}")
    }
}
```

## Explanation

### Issue 1: `map` produces nested list instead of flat list

**Problem:** `expandOrders` returns a `List<List<LineItem>>` at runtime, not a `List<LineItem>`. When the billing service iterates the result and calls `.price` on each element, it actually holds a `List<LineItem>` object, not a `LineItem`, so the JVM throws a `ClassCastException`. The bug is invisible for single-item orders because a list with one element still looks correct during the REPL test.

**Fix:** Replace `orders.map { order -> order.items }` with `orders.flatMap { order -> order.items }`. `flatMap` merges each inner `List<LineItem>` into a single output list, so the return type is `List<LineItem>` as declared.

**Explanation:** `map` applies a transform and wraps each result as-is — when the transform returns `order.items` (a `List<LineItem>`), you get a list of those lists. `flatMap` applies the same transform but then concatenates all the inner collections into one. The JVM's type erasure means the unsafe cast `as List<LineItem>` succeeds at compile time without checking the inner element types, so the compiler never warns you. The `ClassCastException` appears later, at the call site, when the runtime tries to treat a `List<LineItem>` reference as a `LineItem` — which is why a single-item order works (the list happens to be the only element, and nothing iterates deeper in the REPL test). Any order with two or more items exposes the problem immediately in production.

---

### Issue 2: Unsafe cast suppresses a type error that the compiler could catch

**Problem:** The `@Suppress("UNCHECKED_CAST")` annotation silences the compiler warning that exists precisely to flag this situation. Combined with `as List<LineItem>`, it makes the code look type-safe while hiding the mismatch between the real runtime type (`List<List<LineItem>>`) and the declared return type (`List<LineItem>`).

**Fix:** Remove both the `@Suppress("UNCHECKED_CAST")` annotation and the `as List<LineItem>` cast entirely. After switching to `flatMap`, the inferred return type is already `List<LineItem>`, so the explicit cast is unnecessary and the suppression annotation has nothing to suppress.

**Explanation:** Kotlin's generics are erased at runtime, so casting `List<*>` to `List<LineItem>` always succeeds as a no-op — the JVM only checks the outer `List` part. The `@Suppress` annotation tells the compiler to stop warning about this, which removes the only static signal that something is wrong. A good rule of thumb: if you need `@Suppress("UNCHECKED_CAST")` to make code compile without warnings, that is a prompt to reconsider the design rather than silence the diagnostic. Using the correctly-typed `flatMap` here eliminates the need for any cast, letting the compiler verify the return type statically.
