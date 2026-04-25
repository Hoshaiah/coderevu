---
slug: nullable-collection-iteration-npe
track: kotlin
orderIndex: 50
title: Null Platform Type in forEach
difficulty: easy
tags:
  - nullability
  - collections
  - java-interop
language: kotlin
---

## Context

This code lives in `com/example/sync/OrderProcessor.kt`. It processes orders returned by a legacy Java service client. The `JavaOrderService.getPendingOrders()` method is a Java API that returns `List<Order>` — but the Kotlin compiler treats this as a platform type (`List<Order>!`) rather than `List<Order>` or `List<Order>?`.

In production, the processor occasionally crashes with `NullPointerException` at the `forEach` call. This only happens late at night when the upstream Java service goes into maintenance mode and returns `null` instead of an empty list. The on-call team has reproduced it but hasn't found the fix.

The team already verified that `processOrder` itself never throws — the crash is specifically at the iteration site.

## Buggy code

```kotlin
import com.example.legacy.JavaOrderService
import com.example.legacy.Order

class OrderProcessor(
    private val service: JavaOrderService
) {
    fun processPending() {
        val orders = service.getPendingOrders() // returns List<Order>! (platform type)
        orders.forEach { order ->
            processOrder(order)
        }
    }

    private fun processOrder(order: Order) {
        println("Processing order ${order.id}")
    }
}
```
