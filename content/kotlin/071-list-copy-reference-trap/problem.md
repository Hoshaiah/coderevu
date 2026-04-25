---
slug: list-copy-reference-trap
track: kotlin
orderIndex: 71
title: Defensive Copy of Nested List
difficulty: medium
tags:
  - collections
  - correctness
  - api-misuse
language: kotlin
---

## Context

`model/ShoppingCart.kt` is a domain model class that holds a list of `CartItem` objects. It is designed to be immutable from the outside — the constructor accepts a list but the class exposes only a read-only copy, following a pattern described in the team's architecture guide.

QA reports that the cart contents change unexpectedly after being passed to a discount calculation service. Adding items to the cart in one part of the flow retroactively affects a snapshot of the cart taken earlier in the same request. The bug causes incorrect discount amounts in about 3% of orders — those processed in a specific multi-step checkout flow.

The team audited the `DiscountService` and confirmed it does not mutate the cart. The mutation happens at the cart model level. The "immutable copy" pattern they implemented has a subtle flaw.

## Buggy code

```kotlin
data class CartItem(val productId: String, var quantity: Int, val price: Double)

class ShoppingCart(items: List<CartItem>) {
    private val _items: List<CartItem> = items.toList()

    val items: List<CartItem> get() = _items

    fun totalPrice(): Double = _items.sumOf { it.price * it.quantity }
}

// Caller code:
fun checkout(mutableItems: MutableList<CartItem>): ShoppingCart {
    val cart = ShoppingCart(mutableItems)
    mutableItems.add(CartItem("promo-99", 1, 0.0))  // added after cart creation
    return cart
}
```
