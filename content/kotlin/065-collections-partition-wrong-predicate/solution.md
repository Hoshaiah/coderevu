## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Partition Predicate Inverted Results
// ------------------------------------------------------------------------

data class Order(val id: String, val itemsInStock: Boolean)

class OrderProcessor {

    fun splitOrders(orders: List<Order>): Pair<List<Order>, List<Order>> {
        // Returns: Pair(readyToShip, backOrders)
        // CHANGE 1: Destructuring order corrected — partition { it.itemsInStock } puts in-stock orders in the FIRST slot, so assign that to readyToShip, not backOrders.
        val (readyToShip, backOrders) = orders.partition { it.itemsInStock }
        return Pair(readyToShip, backOrders)
    }

    fun process(orders: List<Order>) {
        val (readyToShip, backOrders) = splitOrders(orders)
        readyToShip.forEach { println("Dispatching order ${it.id}") }
        backOrders.forEach { println("Queuing backorder ${it.id}") }
    }
}
```

## Explanation

### Issue 1: `partition` Destructuring Variables Swapped

**Problem:** Every order where `itemsInStock == true` is queued for backorder, and every out-of-stock order is dispatched immediately. Warehouse staff see shipment errors because fulfilled orders are held and unfulfillable orders are sent out.

**Fix:** Swap the destructured variable names at the `val (backOrders, readyToShip)` line so it reads `val (readyToShip, backOrders)`, matching what `partition` actually returns.

**Explanation:** Kotlin's `partition` always returns a `Pair` where the **first** list contains elements for which the predicate is `true` and the **second** list contains elements for which it is `false`. In the buggy code, the predicate is `it.itemsInStock`, so the first slot holds in-stock orders — but the code names that slot `backOrders`. The second slot (out-of-stock) is named `readyToShip`. The subsequent `return Pair(readyToShip, backOrders)` then looks correct in isolation but silently returns `(outOfStock, inStock)` instead of `(inStock, outOfStock)`. Renaming the destructured variables to `(readyToShip, backOrders)` aligns the names with `partition`'s documented contract and makes the return statement produce the correct pair. A related pitfall: tests that only assert on counts — e.g., "3 ready, 2 backorder" — will pass even when the buckets are inverted, so verifying which specific orders are in each bucket is essential.

---

### Issue 2: Misleading Variable Names Mask the Semantic Inversion

**Problem:** Because the destructured names `backOrders` and `readyToShip` are swapped at the assignment site, every subsequent read of those variables propagates the wrong meaning. A reviewer reading just the `return` line or the `process` function sees names that look correct, so the bug survives code review.

**Fix:** The same name correction at `val (readyToShip, backOrders)` (CHANGE 1) resolves this: the names now truthfully describe the contents of each variable throughout the function body.

**Explanation:** When variable names contradict what they hold, the inversion becomes invisible to anyone who trusts the names rather than tracing the data flow back to `partition`. The `return Pair(readyToShip, backOrders)` and the `forEach` calls in `process` all read as semantically correct English, which is exactly why the bug survived a refactor. Keeping variable names consistent with `partition`'s documented first-true, second-false contract makes the code self-verifying: if the predicate or the return order ever changes, the mismatch becomes immediately apparent.
