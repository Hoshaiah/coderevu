## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — groupBy with Mutable Key Object
// ------------------------------------------------------------------------

// CHANGE 1: GroupKey fields changed from `var` to `val` so the key is immutable and safe to use as a map key.
data class GroupKey(val region: String, val productCategory: String)

data class Order(val id: Long, val region: String, val productCategory: String, val amount: Double)

fun groupOrders(orders: List<Order>): Map<GroupKey, List<Order>> {
    // CHANGE 1+2: Removed the single shared `key` instance; now a fresh GroupKey is constructed per order so each map entry holds a distinct, stable key object.
    return orders.groupBy { order ->
        GroupKey(order.region, order.productCategory)
    }
}

fun main() {
    val orders = listOf(
        Order(1, "EU", "Electronics", 99.0),
        Order(2, "US", "Books", 12.0),
        Order(3, "EU", "Electronics", 45.0)
    )
    val grouped = groupOrders(orders)
    grouped.forEach { (k, v) -> println("$k -> ${v.size} orders") }
}
```

## Explanation

### Issue 1: Shared mutable key object reused across groupBy

**Problem:** Every iteration of the `groupBy` lambda mutates the same `key` object instead of producing a new one. Because Kotlin's `groupBy` stores the key reference returned by the lambda, every entry in the resulting map points at the exact same `GroupKey` instance. After the loop finishes, all those references reflect the last order's values, so groups collapse or disappear entirely.

**Fix:** Remove the single shared `key` variable and replace the lambda body with `GroupKey(order.region, order.productCategory)` so a new, independent instance is allocated for each order. This is the `CHANGE 1+2` site in `groupOrders`.

**Explanation:** `HashMap` (which backs Kotlin's `groupBy` result) hashes and stores the key object at insertion time, but it stores a reference, not a copy. When you mutate `key.region` and `key.productCategory` on the next iteration, every previously stored reference now sees the updated values too, because they all point at the same heap object. The hash bucket the key was placed in was computed from the old field values, so lookups using a newly constructed equal key may not even find the entry — the bucket positions are now stale. Constructing a new `GroupKey` per order gives each map entry its own stable, independent reference that cannot be changed after insertion.

---

### Issue 2: Mutable `var` fields on a data class used as a map key

**Problem:** `GroupKey` declares its fields with `var`, meaning any code that holds a reference to a key can mutate it after the key has been inserted into a `HashMap`. Because `HashMap` computes the bucket from `hashCode()` at insertion time and never recomputes it, mutating a field later moves the logical identity of the key without moving it in the bucket array, making the entry unreachable via normal lookup.

**Fix:** Change `var region` and `var productCategory` to `val region` and `val productCategory` in the `GroupKey` data class declaration (the `CHANGE 1` site at the top of the file).

**Explanation:** Kotlin's `data class` generates `hashCode()` and `equals()` from all constructor properties. If those properties are `var`, the generated `hashCode()` value can change after the object is created. A `HashMap` places an entry in `bucket = hashCode() % capacity`; if `hashCode()` later returns a different value, the entry sits in the wrong bucket and lookups return `null`. Making the fields `val` guarantees the hash is stable for the lifetime of the object. As a related pitfall: even if you never intentionally mutate a key, passing a mutable key object through asynchronous or multi-step pipelines creates a window where accidental mutation can silently corrupt a map without throwing any exception.
