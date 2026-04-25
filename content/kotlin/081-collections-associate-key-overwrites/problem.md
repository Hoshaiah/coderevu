---
slug: collections-associate-key-overwrites
track: kotlin
orderIndex: 81
title: associateBy Silently Drops Duplicate Keys
difficulty: medium
tags:
  - collections
  - correctness
  - data-loss
language: kotlin
---

## Context

This code is in `OrderRepository.kt` and builds an in-memory lookup map of orders by customer ID. The application uses this map during checkout to quickly find a customer's pending order and apply a discount. Each customer is expected to have at most one active order, but the business rule is enforced at the application layer — the database can sometimes have legacy duplicate rows.

The support team reports that customers occasionally lose their discount even though the system shows they have a pending order. Metrics show the discount application rate drops after database migrations that upsert historical order data. The map is rebuilt from a fresh DB query before each checkout.

Engineering ruled out DB-level issues — the raw query does return multiple rows per customer in some cases. They cannot explain why only the first or last order ends up in the map.

## Buggy code

```kotlin
data class Order(val orderId: String, val customerId: String, val status: String, val discountCode: String?)

class OrderRepository {

    fun buildOrderLookup(orders: List<Order>): Map<String, Order> {
        return orders.associateBy { it.customerId }
    }

    fun findPendingOrder(orders: List<Order>, customerId: String): Order? {
        val lookup = buildOrderLookup(orders)
        return lookup[customerId]
    }
}
```
