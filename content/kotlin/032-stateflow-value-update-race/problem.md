---
slug: stateflow-value-update-race
track: kotlin
orderIndex: 32
title: StateFlow Update Race Condition
difficulty: hard
tags:
  - coroutines
  - android
  - concurrency
language: kotlin
---

## Context

This is `ShoppingCartViewModel.kt` in an Android e-commerce app. Multiple coroutines can add items to the shopping cart concurrently — one triggered by user taps and one triggered by deep-link intent processing. The cart count is exposed as a `StateFlow<Int>` and shown in a badge on the toolbar.

Users report that after rapidly tapping 'Add to Cart' several times while a deep-link auto-adds an item, the badge count is lower than the actual number of items. The discrepancy is usually 1-2 items and only happens under concurrent load.

The team added logging and confirmed each individual add operation executes, but the final count in the `StateFlow` doesn't reflect all of them. No exceptions are thrown.

## Buggy code

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class ShoppingCartViewModel : CoroutineScope by CoroutineScope(Dispatchers.Default) {
    private val _cartCount = MutableStateFlow(0)
    val cartCount: StateFlow<Int> = _cartCount.asStateFlow()

    fun addItem() {
        launch {
            val current = _cartCount.value
            delay(10) // simulate some async work (e.g., DB write)
            _cartCount.value = current + 1
        }
    }

    fun addItemFromDeepLink() {
        launch {
            val current = _cartCount.value
            delay(5)
            _cartCount.value = current + 1
        }
    }
}
```
