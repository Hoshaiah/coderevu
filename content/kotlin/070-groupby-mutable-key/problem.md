---
slug: groupby-mutable-key
track: kotlin
orderIndex: 70
title: groupBy with Mutable Key Object
difficulty: medium
tags:
  - collections
  - correctness
  - data-classes
language: kotlin
---

## Context

`reporting/OrderGrouper.kt` groups e-commerce orders by a composite key of `(region, productCategory)` using Kotlin's `groupBy`. The result is used to build a summary report that is serialized to JSON and uploaded to a data warehouse nightly.

Operators notice that some groups in the JSON report are empty or missing entirely while others contain far more orders than expected. The discrepancy is not consistent — it changes between nightly runs even when the underlying data hasn't changed. Manual SQL checks confirm the source data is correct.

The developer added logging that prints group sizes right after `groupBy` — those already show the wrong distribution, ruling out a serialization bug. The issue is upstream, in the grouping step itself.

## Buggy code

```kotlin
data class GroupKey(var region: String, var productCategory: String)

data class Order(val id: Long, val region: String, val productCategory: String, val amount: Double)

fun groupOrders(orders: List<Order>): Map<GroupKey, List<Order>> {
    val key = GroupKey("", "")
    return orders.groupBy { order ->
        key.region = order.region
        key.productCategory = order.productCategory
        key
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
