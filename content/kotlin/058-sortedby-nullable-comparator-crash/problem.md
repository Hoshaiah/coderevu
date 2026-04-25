---
slug: sortedby-nullable-comparator-crash
track: kotlin
orderIndex: 58
title: sortedBy on Nullable Field Crashes
difficulty: easy
tags:
  - collections
  - nullability
  - sorting
language: kotlin
---

## Context

This is in `reports/OrderExporter.kt`. The function sorts a list of orders by their `shippedAt` timestamp before writing them to a CSV export. `shippedAt` is nullable because orders that haven't shipped yet don't have a timestamp. In production, exports are requested daily.

The export job crashes with `NullPointerException` on days when any unshipped orders are in the result set. On days where all orders have shipped it works fine. The stack trace points directly to the `sortedBy` call.

## Buggy code

```kotlin
import java.time.Instant

data class Order(
    val id: String,
    val total: Double,
    val shippedAt: Instant?
)

fun exportOrders(orders: List<Order>): List<Order> {
    return orders.sortedBy { it.shippedAt }
}
```
