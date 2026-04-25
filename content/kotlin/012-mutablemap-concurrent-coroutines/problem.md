---
slug: mutablemap-concurrent-coroutines
track: kotlin
orderIndex: 12
title: Shared MutableMap Across Coroutines
difficulty: medium
tags:
  - coroutines
  - concurrency
  - collections
language: kotlin
---

## Context

`CacheWarmer.kt` pre-populates an in-memory product cache by launching parallel coroutines — one per product category — and storing fetched items into a shared `MutableMap`. The code uses `Dispatchers.IO` so all coroutines run on a thread pool simultaneously.

In load tests the cache ends up with fewer entries than expected, and occasionally the service throws `ConcurrentModificationException` during the map iteration that happens right after warming. The issue is non-deterministic and never reproduces in unit tests that run sequentially.

The team verified that the API calls themselves return correct data and the total count of items returned across all categories is always correct. The loss happens somewhere during insertion.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class CacheWarmer(private val api: ProductApi) {

    private val cache = mutableMapOf<String, Product>()

    suspend fun warmAll(categories: List<String>) = coroutineScope {
        categories.map { category ->
            async(Dispatchers.IO) {
                val products = api.fetchCategory(category)
                for (product in products) {
                    cache[product.id] = product  // shared mutable state
                }
            }
        }.awaitAll()
    }

    fun getAll(): Map<String, Product> = cache
}
```
