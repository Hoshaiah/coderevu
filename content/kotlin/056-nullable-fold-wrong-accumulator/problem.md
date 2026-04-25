---
slug: nullable-fold-wrong-accumulator
track: kotlin
orderIndex: 56
title: Nullable Fold Loses Values Silently
difficulty: hard
tags:
  - nullability
  - collections
  - correctness
language: kotlin
---

## Context

This is `ReportAggregator.kt` in a financial reporting service. It aggregates a list of nullable transaction amounts into a running total, skipping nulls (which represent missing data). The aggregator is called nightly to produce daily summaries, and results feed into regulatory reports.

Auditors flagged that daily totals are sometimes lower than expected — specifically, the total is wrong whenever the first transaction in the list has a missing value (`null`). When the first element is non-null, totals match manual calculations perfectly.

The developer tested with lists where all values are non-null and all tests passed. The bug only manifests when `amounts.first()` is `null`.

## Buggy code

```kotlin
class ReportAggregator {

    fun totalAmount(amounts: List<Double?>): Double {
        return amounts.fold(null) { acc: Double?, amount ->
            when {
                acc == null && amount == null -> null
                acc == null -> amount
                amount == null -> acc
                else -> acc + amount
            }
        } ?: 0.0
    }

    fun generateDailySummary(transactions: List<Double?>): String {
        val total = totalAmount(transactions)
        return "Daily total: $total"
    }
}
```
