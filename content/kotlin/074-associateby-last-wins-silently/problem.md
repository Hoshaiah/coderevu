---
slug: associateby-last-wins-silently
track: kotlin
orderIndex: 74
title: associateBy Silently Drops Duplicates
difficulty: medium
tags:
  - collections
  - correctness
  - data-loss
language: kotlin
---

## Context

`OrderService.kt` loads a batch of orders from the database and indexes them by order ID using `associateBy` for O(1) lookup later in the processing pipeline. The database occasionally returns duplicate order IDs due to a known join bug in a legacy query that is pending a fix.

Business operations reported that some orders are being processed twice while others are being silently skipped. Audit logs show the total order count entering the pipeline is correct, but the indexed map has fewer entries than expected on affected batches.

The team added logging before the `associateBy` call and confirmed duplicates are present in the incoming list. They expected an exception or at least a log entry when a duplicate key is encountered.

## Buggy code

```kotlin
data class Order(val id: String, val customerId: String, val amount: Double)

class OrderService(private val db: OrderDatabase) {

    fun processOrders(batchId: String) {
        val orders: List<Order> = db.fetchBatch(batchId)

        // If two orders share an id, the second silently overwrites the first
        val indexed: Map<String, Order> = orders.associateBy { it.id }

        for ((id, order) in indexed) {
            processOrder(order)
        }
    }

    private fun processOrder(order: Order) { /* ... */ }
}
```
