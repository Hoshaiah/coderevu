---
slug: nullable-lambda-result-ignored
track: kotlin
orderIndex: 53
title: Nullable Lambda Return Silently Ignored
difficulty: easy
tags:
  - nullability
  - collections
  - correctness
language: kotlin
---

## Context

This utility lives in `ProductSearchService.kt` and is responsible for mapping raw API responses to display-ready `Product` objects. The function filters the raw list, removes items without a valid price, and returns a list of mapped products.

QA reports that the displayed product list sometimes contains items with a `null` display price, which causes a crash in the UI layer when it tries to format the price string. The crash only happens for certain product categories where roughly 20% of items have no price in the API response.

The developer insists the code explicitly filters out null-price items using `filter`, but the UI team keeps seeing null prices in the resulting list. The filtering logic looks correct at a glance.

## Buggy code

```kotlin
data class RawProduct(val id: String, val name: String, val priceRaw: String?)
data class Product(val id: String, val name: String, val displayPrice: String)

fun mapProducts(rawItems: List<RawProduct>): List<Product> {
    return rawItems
        .filter { it.priceRaw != null }
        .map { raw ->
            Product(
                id = raw.id,
                name = raw.name,
                displayPrice = formatPrice(raw.priceRaw)
            )
        }
}

fun formatPrice(price: String?): String {
    return price?.let { "$$it" } ?: "N/A"
}
```
