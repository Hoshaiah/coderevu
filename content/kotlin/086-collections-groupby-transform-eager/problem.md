---
slug: collections-groupby-transform-eager
track: kotlin
orderIndex: 86
title: groupBy Transform Evaluates Eagerly Per Element
difficulty: hard
tags:
  - collections
  - performance
  - sequences
language: kotlin
---

## Context

`ProductCatalogIndexer.kt` builds an inverted index from a large product catalog (500k+ items) for a search feature. For each product, it extracts all searchable tokens from the title, description, and tags, then groups products by token. The index is rebuilt every hour from a database export.

Ops reports that the hourly rebuild takes 40+ minutes and spikes memory to 8 GB before the indexer OOMs. The product catalog is large but not unreasonably so. Profiling shows the majority of time is spent in collection operations before any grouping has completed.

A developer optimized the token extraction to be faster but saw no improvement. The data loading from disk is confirmed to be fast. The issue appears to be in the in-memory transformation pipeline.

## Buggy code

```kotlin
data class Product(val id: String, val title: String, val tags: List<String>)

class ProductCatalogIndexer {
    fun buildIndex(products: List<Product>): Map<String, List<Product>> {
        return products
            .flatMap { product ->
                extractTokens(product).map { token -> token to product }
            }
            .groupBy({ it.first }, { it.second })
    }

    private fun extractTokens(product: Product): List<String> {
        return (product.title.split(" ") + product.tags)
            .map { it.lowercase().trim() }
            .filter { it.length > 2 }
    }
}
```
