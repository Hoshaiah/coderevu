## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — associateBy Silently Drops Duplicate Keys
// ------------------------------------------------------------------------

data class Order(val orderId: String, val customerId: String, val status: String, val discountCode: String?)

class OrderRepository {

    fun buildOrderLookup(orders: List<Order>): Map<String, Order> {
        // CHANGE 1: Replace associateBy (which silently overwrites duplicate keys with the last value) with groupBy + explicit duplicate handling so duplicates are detected and a safe choice is made rather than a silent drop.
        val grouped = orders.groupBy { it.customerId }
        return grouped.mapValues { (customerId, ordersForCustomer) ->
            if (ordersForCustomer.size > 1) {
                // CHANGE 1: Log or handle the duplicate case explicitly; here we pick the first to make the behaviour deterministic and visible rather than arbitrary.
                System.err.println("WARNING: duplicate orders for customerId=$customerId, picking first of ${ordersForCustomer.size}")
            }
            ordersForCustomer.first()
        }
    }

    fun findPendingOrder(orders: List<Order>, customerId: String): Order? {
        // CHANGE 2: Filter to only pending orders before building the lookup so a non-pending duplicate row cannot overwrite or hide the actual pending order.
        val pendingOrders = orders.filter { it.status == "pending" }
        val lookup = buildOrderLookup(pendingOrders)
        return lookup[customerId]
    }
}
```

## Explanation

### Issue 1: `associateBy` Silently Drops Duplicate Keys

**Problem:** When two `Order` rows share the same `customerId`, `associateBy` keeps only the last one it encounters and discards the earlier entry without any warning. The support team sees customers losing discounts because the order that carries a `discountCode` gets silently replaced by a duplicate that has `null` for the code.

**Fix:** Replace `associateBy` with `groupBy` followed by `mapValues` that explicitly picks `ordersForCustomer.first()` and emits a warning when the group has more than one element. This is the CHANGE 1 site.

**Explanation:** `associateBy` is documented to overwrite the map entry whenever two elements produce the same key, so the winning entry depends entirely on list ordering, which is driven by the DB query's undefined sort order. After a migration upsert the row ordering can change, flipping which order survives. Using `groupBy` makes every duplicate visible as a list, forcing the code to make an explicit choice and leaving a log trail. A related pitfall: even after fixing this, the order chosen might still be the wrong one if both duplicates are present — the warning log is the signal to also fix the upstream upsert logic.

---

### Issue 2: Lookup Built from All Orders, Not Just Pending Ones

**Problem:** `buildOrderLookup` receives the full, unfiltered list of orders. If a customer has a legacy `completed` order row and a `pending` order row, the lookup can end up holding the `completed` one depending on which survives the `associateBy` collision, and `findPendingOrder` then returns that wrong order (or `null` if the customer is not in the map at all).

**Fix:** Add `orders.filter { it.status == "pending" }` inside `findPendingOrder` before passing the list to `buildOrderLookup`. This is the CHANGE 2 site.

**Explanation:** The method is called `findPendingOrder`, so its contract implies it returns a pending order or nothing. Without the filter, a non-pending row can enter the lookup and be returned as if it were actionable, causing the discount application logic to work on an order it should ignore. Filtering first also reduces the chance of a duplicate-key collision, because two rows for the same customer are less likely to both be in `pending` status. Note that the filter must live in `findPendingOrder` rather than `buildOrderLookup` so that `buildOrderLookup` stays a general-purpose utility and callers can apply their own status criteria.
