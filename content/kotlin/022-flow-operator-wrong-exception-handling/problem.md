---
slug: flow-operator-wrong-exception-handling
track: kotlin
orderIndex: 22
title: Flow catch Misses Upstream Exceptions
difficulty: medium
tags:
  - coroutines
  - flow
  - error-handling
language: kotlin
---

## Context

This is `PriceRepository.kt` in an e-commerce Android app. It exposes a `Flow<Price>` that fetches live pricing data from a remote API. The flow uses `catch` to recover from network errors by emitting a cached price instead. The result is collected in a `ViewModel` and displayed in the UI.

During chaos-engineering tests, engineers inject network failures and expect to see the cached price displayed. Instead, the app crashes with an unhandled exception propagating to the `ViewModel`. The `catch` operator seems to do nothing.

Code review confirmed the `catch` block is present and syntactically correct. The issue is subtle and relates to the order of operators in the flow pipeline.

## Buggy code

```kotlin
import kotlinx.coroutines.flow.*

data class Price(val amount: Double, val currency: String)

class PriceRepository(
    private val api: PricingApi,
    private val cache: PriceCache
) {
    fun livePrice(productId: String): Flow<Price> =
        flow {
            val price = api.fetchPrice(productId)
            emit(price)
        }
        .map { price -> price.copy(amount = price.amount * 1.1) }
        .catch { e ->
            val cached = cache.getPrice(productId)
            if (cached != null) emit(cached)
            else throw e
        }
        .onEach { price ->
            if (price.amount <= 0) throw IllegalStateException("Non-positive price: ${price.amount}")
        }
}

interface PricingApi { suspend fun fetchPrice(id: String): Price }
interface PriceCache { fun getPrice(id: String): Price? }
```
