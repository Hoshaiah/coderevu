---
slug: stateflow-collect-latest-race
track: kotlin
orderIndex: 42
title: collectLatest Cancels Incomplete Work
difficulty: hard
tags:
  - coroutines
  - android
  - correctness
language: kotlin
---

## Context

`OrderProcessingViewModel.kt` observes a `StateFlow` of order events using `collectLatest`. Each event triggers an order submission that makes a network call and then writes a confirmation to the local database. The `collectLatest` operator was chosen to avoid processing stale events when a newer one arrives.

The support team sees a class of bugs where orders are submitted to the backend (charges appear on customer cards) but no confirmation is written to the local DB. The backend confirms the order was received, but the app shows "Order pending" indefinitely. This only happens when two order events arrive in quick succession.

The developer argues `collectLatest` is correct because they only care about the latest event. They point out that duplicate order submission is worse than a missed DB write, and that `collectLatest` prevents duplicate network calls.

## Buggy code

```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class OrderEvent(val orderId: String, val items: List<String>)

class OrderProcessingViewModel(
    private val orderEvents: StateFlow<OrderEvent?>,
    private val api: OrderApi,
    private val db: OrderDatabase
) : ViewModel() {

    init {
        viewModelScope.launch {
            orderEvents.collectLatest { event ->
                if (event == null) return@collectLatest
                val confirmation = api.submitOrder(event)
                db.saveConfirmation(confirmation)
            }
        }
    }
}

interface OrderApi {
    suspend fun submitOrder(event: OrderEvent): String
}

interface OrderDatabase {
    suspend fun saveConfirmation(confirmation: String)
}
```
