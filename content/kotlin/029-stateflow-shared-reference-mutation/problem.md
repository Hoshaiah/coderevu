---
slug: stateflow-shared-reference-mutation
track: kotlin
orderIndex: 29
title: StateFlow Value Mutated In Place
difficulty: hard
tags:
  - coroutines
  - android
  - stateflow
language: kotlin
---

## Context

`CartViewModel.kt` maintains a shopping cart as a `StateFlow<List<CartItem>>`. When the user adds an item, the ViewModel mutates the list and then emits it. The UI is supposed to update every time an item is added.

Collectors on the UI side occasionally do not recompose after adding an item. Adding an item a second time always triggers the recompose, but the first add is silently swallowed in some code paths. The bug is hard to reproduce in isolation because it depends on how recently the UI subscribed.

The team verified that `add()` is always called on the correct dispatcher and that the `StateFlow` collector is active. Logging shows the `emit` line executes, yet the UI does not react.

## Buggy code

```kotlin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class CartItem(val id: String, val name: String, val quantity: Int)

class CartViewModel {

    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart

    fun addItem(item: CartItem) {
        val current = _cart.value as MutableList<CartItem>
        current.add(item)
        _cart.value = current  // same reference — StateFlow equality check skips emission
    }
}
```
