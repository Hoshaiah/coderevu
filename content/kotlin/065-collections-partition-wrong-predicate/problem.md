---
slug: collections-partition-wrong-predicate
track: kotlin
orderIndex: 65
title: Partition Predicate Inverted Results
difficulty: easy
tags:
  - collections
  - correctness
  - kotlin
language: kotlin
---

## Context

This is `OrderProcessor.kt` in a warehouse management system. Orders arriving from the API are split into two groups: those that can be fulfilled immediately (all items in stock) and those that must be backordered. Each group is processed by a different downstream handler.

Warehouse staff report that stock items are being queued for backorder and backordered items are being dispatched immediately, causing shipment errors and customer complaints. The bug appeared after a refactor that switched from two separate filter calls to a single `partition` call.

Unit tests written before the refactor all pass because they only tested the counts of each group, not which order ended up in which bucket.

## Buggy code

```kotlin
data class Order(val id: String, val itemsInStock: Boolean)

class OrderProcessor {

    fun splitOrders(orders: List<Order>): Pair<List<Order>, List<Order>> {
        // Returns: Pair(readyToShip, backOrders)
        val (backOrders, readyToShip) = orders.partition { it.itemsInStock }
        return Pair(readyToShip, backOrders)
    }

    fun process(orders: List<Order>) {
        val (readyToShip, backOrders) = splitOrders(orders)
        readyToShip.forEach { println("Dispatching order ${it.id}") }
        backOrders.forEach { println("Queuing backorder ${it.id}") }
    }
}
```
