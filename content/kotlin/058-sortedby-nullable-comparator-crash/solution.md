## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — sortedBy on Nullable Field Crashes
// ------------------------------------------------------------------------

import java.time.Instant

data class Order(
    val id: String,
    val total: Double,
    val shippedAt: Instant?
)

fun exportOrders(orders: List<Order>): List<Order> {
    // CHANGE 1: Replace sortedBy with sortedWith(compareBy(nullsLast(...))) so null shippedAt values are handled without NPE and sorted to the end of the list.
    return orders.sortedWith(compareBy(nullsLast(naturalOrder())) { it.shippedAt })
}
```

## Explanation

### Issue 1: `sortedBy` crashes on nullable selector

**Problem:** When any `Order` in the list has a null `shippedAt`, the export job throws a `NullPointerException` at the `sortedBy` call. This only happens on days when unshipped orders appear in the result set, making the bug intermittent and hard to reproduce in environments where test data is always fully shipped.

**Fix:** Replace `sortedBy { it.shippedAt }` with `sortedWith(compareBy(nullsLast(naturalOrder())) { it.shippedAt })`. The `nullsLast` comparator wraps `naturalOrder<Instant>()` and explicitly handles `null` by placing those elements after all non-null ones.

**Explanation:** `sortedBy` internally calls `compareTo` on the values returned by the selector lambda. `Instant` implements `Comparable<Instant>`, so non-null values work fine. But when the selector returns `null`, Kotlin tries to use it in a comparison and the JVM throws `NullPointerException` because you cannot call `compareTo` on a null reference. `sortedWith` accepts an explicit `Comparator`, and `nullsLast(naturalOrder())` is a standard-library comparator that checks for null before delegating to the natural order, routing null values to the end. A related pitfall: if business rules later change so unshipped orders should sort first, you only need to swap `nullsLast` for `nullsFirst` — the structure stays the same.

---

### Issue 2: Ambiguous sort position for unshipped orders

**Problem:** Even after fixing the NPE, the code has no explicit statement about where orders with no `shippedAt` should appear in the export. Leaving this implicit makes the behavior surprising to future readers and fragile if the comparator is changed.

**Fix:** The `nullsLast(naturalOrder())` argument in the `CHANGE 1` line encodes the business decision directly: unshipped orders (null timestamp) sort after all shipped orders in the CSV output.

**Explanation:** When a sort key can be null, there are two reasonable choices — nulls first or nulls last — and neither is more "correct" in general. Hard-coding `nullsLast` makes the decision visible in the code rather than relying on whatever behavior the runtime happens to exhibit. If the product team later decides unshipped orders should appear at the top of the daily export, a reviewer can find and change exactly this one token instead of hunting for implicit behavior. Encoding the intent also makes the code easier to test: you can write a single unit test with a mix of shipped and unshipped orders and assert the exact output ordering.
