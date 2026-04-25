---
slug: mutablestateflow-update-not-atomic
track: kotlin
orderIndex: 39
title: StateFlow update Race on Increment
difficulty: hard
tags:
  - coroutines
  - android
  - concurrency
language: kotlin
---

## Context

This cart ViewModel lives in `CartViewModel.kt` in an Android e-commerce app. It manages a count of items in a shopping cart. Multiple coroutines can call `addItem` concurrently — one from user taps (main dispatcher) and one from a background sync that reconciles local state with the server (IO dispatcher). Both use `viewModelScope`.

Customers report that the cart badge occasionally shows the wrong count. After adding several items quickly (especially while a background sync is running), the count can appear to decrease or lose increments. The issue is rare in testing but reproducible under load in production.

The developer checked that each individual `addItem` call reads the current value and writes back an incremented value. They did not find an obvious bug on first inspection because the state access looks atomic.

## Buggy code

```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class CartViewModel : ViewModel() {

    private val _itemCount = MutableStateFlow(0)
    val itemCount: StateFlow<Int> = _itemCount

    fun addItem(quantity: Int = 1) {
        viewModelScope.launch {
            val current = _itemCount.value
            _itemCount.value = current + quantity
        }
    }

    fun syncFromServer(serverCount: Int) {
        viewModelScope.launch(Dispatchers.IO) {
            // ... some IO work
            val current = _itemCount.value
            _itemCount.value = maxOf(current, serverCount)
        }
    }
}
```
