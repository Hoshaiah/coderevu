---
slug: data-class-copy-immutable-collection
track: kotlin
orderIndex: 82
title: Data Class Copy Shares Mutable List
difficulty: medium
tags:
  - collections
  - nullability
  - correctness
language: kotlin
---

## Context

`CartState.kt` models the user's shopping cart as an immutable data class used with a Redux-style state container. Each user action produces a new `CartState` via `.copy()`. The design goal is that old state snapshots are preserved for undo functionality and analytics events.

The QA team found that undoing a cart modification sometimes shows the wrong previous state — specifically, the undo snapshot already reflects the change that was supposed to be undone. The bug is intermittent and appears only when items are added or removed, not when the cart total is recalculated.

The developer confirmed that `copy()` is being called and the old state reference is stored before the new state is applied. They checked that `CartState` is a `data class` and assumed that `copy()` creates an independent snapshot.

## Buggy code

```kotlin
data class CartItem(val productId: String, val quantity: Int)

data class CartState(
    val items: MutableList<CartItem>,
    val couponCode: String?,
    val totalCents: Int
)

class CartStore {
    private var currentState = CartState(
        items = mutableListOf(),
        couponCode = null,
        totalCents = 0
    )
    private val history = mutableListOf<CartState>()

    fun addItem(item: CartItem) {
        val snapshot = currentState.copy()
        history.add(snapshot)
        currentState.items.add(item)
        currentState = currentState.copy(
            totalCents = currentState.items.sumOf { it.quantity * 100 }
        )
    }

    fun undo(): CartState? {
        return history.removeLastOrNull()?.also { currentState = it }
    }
}
```
