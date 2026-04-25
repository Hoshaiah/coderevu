## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — associateBy Silently Drops Duplicates
// ------------------------------------------------------------------------

data class Order(val id: String, val customerId: String, val amount: Double)

class OrderService(private val db: OrderDatabase) {

    fun processOrders(batchId: String) {
        val orders: List<Order> = db.fetchBatch(batchId)

        // CHANGE 1: Group by id first so duplicate keys are detected rather than silently overwritten by associateBy.
        val grouped: Map<String, List<Order>> = orders.groupBy { it.id }

        // CHANGE 2: Reject the entire batch if any id has more than one order, making the duplicate-key failure loud and explicit.
        val duplicateIds = grouped.filterValues { it.size > 1 }.keys
        if (duplicateIds.isNotEmpty()) {
            throw IllegalStateException("Duplicate order IDs detected in batch '$batchId': $duplicateIds")
        }

        val indexed: Map<String, Order> = grouped.mapValues { (_, v) -> v.single() }

        for ((id, order) in indexed) {
            processOrder(order)
        }
    }

    private fun processOrder(order: Order) { /* ... */ }
}
```

## Explanation

### Issue 1: `associateBy` Silently Drops Duplicate Keys

**Problem:** When the database returns two `Order` objects with the same `id`, `associateBy` keeps only the last one it sees and discards the earlier one without throwing or logging. Business operations see the total input count as correct but fewer orders are actually processed, and there is no trace of which orders were lost.

**Fix:** Replace `associateBy` with `groupBy` (CHANGE 1), then check whether any key maps to more than one order and throw an `IllegalStateException` listing the offending IDs (CHANGE 2). After the guard passes, `mapValues { it.single() }` produces the same `Map<String, Order>` the rest of the pipeline expects.

**Explanation:** `associateBy` is implemented as a fold that calls `put` on a `LinkedHashMap`; `put` on an existing key returns the old value and replaces it silently — there is no hook to detect the collision. `groupBy` instead accumulates all values into a `List` per key, so every input element is preserved. Inspecting the list sizes then makes duplicate keys visible. Throwing an exception is appropriate here because the root cause is a known upstream bug (the legacy join): processing a batch with duplicates would either double-process one order or skip another, both of which are worse than a loud failure. A related pitfall: if you used `associateBy` with a `merge` lambda via the Java `Map.merge` API you could detect collisions, but Kotlin's stdlib offers no such overload, making the `groupBy`-then-validate pattern the idiomatic approach.

---

### Issue 2: Silent Data Loss Is Invisible to the Caller

**Problem:** Even if someone notices the map is smaller than the input list, the original code provides no signal — no exception, no log, no metric. The caller of `processOrders` receives a normal return and has no way to know that orders were quietly skipped.

**Fix:** CHANGE 2 adds an explicit `IllegalStateException` that names the batch ID and every duplicate order ID before any processing begins, so the failure surfaces immediately in logs, alerting systems, and call-stack traces rather than appearing only as a discrepancy in downstream audits.

**Explanation:** The bug produces a postcondition violation — the indexed map is supposed to represent every order in the batch, but it does not — yet the method returns successfully. Callers that catch only checked exceptions (or that simply don't inspect return values) will never know. Failing fast before the loop starts means no order is processed from a corrupt batch, which is safer than processing some orders and silently skipping others. If partial processing is acceptable for the business, the right alternative is to log each duplicate ID at ERROR level and skip or quarantine the affected entries explicitly, still avoiding silent loss.
