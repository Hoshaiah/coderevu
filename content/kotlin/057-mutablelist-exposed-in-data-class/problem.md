---
slug: mutablelist-exposed-in-data-class
track: kotlin
orderIndex: 57
title: Mutable List Leaked from Data Class
difficulty: easy
tags:
  - collections
  - immutability
  - data-classes
language: kotlin
---

## Context

This is in `model/ShoppingCart.kt`. `ShoppingCart` is a data class passed around between the ViewModel and the UI layer. The intent is that the cart's item list can only be changed through dedicated methods like `addItem` and `removeItem`, which also fire analytics events.

A bug report came in where items are appearing in the cart without the analytics events firing. After investigation, the team found that some UI code is calling `cart.items.add(item)` directly — but `items` is supposed to be a read-only list.

## Buggy code

```kotlin
data class CartItem(val sku: String, val quantity: Int)

data class ShoppingCart(
    val id: String,
    val items: List<CartItem>
) {
    fun addItem(item: CartItem): ShoppingCart {
        val updated = (items + item) as MutableList<CartItem>
        return copy(items = updated)
    }

    fun removeItem(sku: String): ShoppingCart {
        return copy(items = items.filter { it.sku != sku })
    }
}
```
