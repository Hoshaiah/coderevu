---
slug: data-class-copy-deep-vs-shallow
track: kotlin
orderIndex: 64
title: Data Class copy Shares Mutable State
difficulty: easy
tags:
  - collections
  - nullability
  - data-class
language: kotlin
---

## Context

This is `CartService.kt` in an online shopping backend. When a user checks out, the service snapshots their current cart as an `Order` using Kotlin's `data class copy()` to preserve the state at the time of purchase. Modifications to the cart after checkout should not affect the order.

Users report that their order history shows incorrect line items — items that were removed or added after checkout appear in saved orders. The bug is intermittent and seems to affect users who modify their cart quickly after placing an order.

The team verified that `copy()` is being called correctly and that the `Order` is persisted before the cart is modified. The snapshot appears to be taken at the right moment.

## Buggy code

```kotlin
data class CartItem(val productId: String, var quantity: Int)

data class Cart(val items: MutableList<CartItem>)

data class Order(val id: String, val items: MutableList<CartItem>)

class CartService {
    private val cart = Cart(mutableListOf())

    fun addItem(productId: String, quantity: Int) {
        cart.items.add(CartItem(productId, quantity))
    }

    fun checkout(orderId: String): Order {
        // Take a snapshot of the cart for the order
        val order = Order(orderId, cart.items)
        persistOrder(order)
        return order
    }

    fun updateItemQuantity(productId: String, newQuantity: Int) {
        cart.items.find { it.productId == productId }?.quantity = newQuantity
    }

    private fun persistOrder(order: Order) {
        println("Persisting order: $order")
    }
}
```
