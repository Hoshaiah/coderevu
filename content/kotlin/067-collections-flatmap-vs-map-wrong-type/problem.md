---
slug: collections-flatmap-vs-map-wrong-type
track: kotlin
orderIndex: 67
title: flatMap Returns Nested Lists
difficulty: easy
tags:
  - collections
  - kotlin-idioms
  - correctness
language: kotlin
---

## Context

This data pipeline step lives in `pipeline/OrderTransformer.kt` and is responsible for expanding each `Order` into individual `LineItem` objects before they are passed to the billing service. The function is called once per batch of orders received from the message queue.

In production, the billing service occasionally reports receiving a `List<List<LineItem>>` instead of a flat `List<LineItem>`, causing a `ClassCastException` when it tries to iterate and call `.price` on each element. The error is intermittent because it only surfaces when an order contains more than one line item — single-item orders pass through without issue, masking the bug during most of QA.

The developer who wrote this was familiar with Java streams and used `map` expecting it to behave like `flatMap`. The Kotlin REPL test they ran only used single-element inner lists, so the output looked correct.

## Buggy code

```kotlin
data class LineItem(val productId: String, val price: Double)
data class Order(val id: String, val items: List<LineItem>)

fun expandOrders(orders: List<Order>): List<LineItem> {
    @Suppress("UNCHECKED_CAST")
    return orders.map { order ->
        order.items
    } as List<LineItem>  // unsafe cast hides the real type
}

fun processBatch(orders: List<Order>) {
    val lineItems = expandOrders(orders)
    for (item in lineItems) {
        // ClassCastException at runtime when order has >1 item
        println("Billing item ${item.productId} at ${item.price}")
    }
}
```
