---
slug: groupby-lost-duplicates
track: kotlin
orderIndex: 72
title: associateBy Drops Duplicate Keys
difficulty: medium
tags:
  - collections
  - maps
  - data-loss
language: kotlin
---

## Context

This is in `inventory/StockAggregator.kt`. The function builds an index of stock records keyed by SKU for fast lookup. A SKU can appear multiple times in the input if the same product is stocked in different warehouses. The intent is to collect all records for a given SKU.

Inventory reports show incorrect stock totals — some SKUs appear to have lower stock than they actually do. Adding debug logging shows that for SKUs present in multiple warehouses, only one warehouse's record appears in the map. No errors or warnings are logged.

## Buggy code

```kotlin
data class StockRecord(
    val sku: String,
    val warehouseId: String,
    val quantity: Int
)

fun buildStockIndex(records: List<StockRecord>): Map<String, StockRecord> {
    return records.associateBy { it.sku }
}

fun totalStock(sku: String, index: Map<String, StockRecord>): Int {
    return index[sku]?.quantity ?: 0
}
```
