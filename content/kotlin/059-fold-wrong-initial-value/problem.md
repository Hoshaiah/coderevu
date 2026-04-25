---
slug: fold-wrong-initial-value
track: kotlin
orderIndex: 59
title: fold Initial Value Wrong Type
difficulty: easy
tags:
  - collections
  - functional
  - correctness
language: kotlin
---

## Context

`InvoiceCalculator.kt` sums line-item totals from a list of `LineItem` objects to produce a final invoice amount. The function is called in a billing service that processes thousands of invoices per day. Each `LineItem.amount` is a `Double`.

Finance noticed that large invoices are coming out with amounts that are a few cents off. The discrepancy grows with the number of line items. Unit tests pass because the test invoices are small (under 10 items). The bug only becomes visible on invoices with 50+ line items.

Logging the intermediate values reveals that the computation drifts after a certain number of additions, but the root cause is an avoidable precision loss introduced at the very start of the fold.

## Buggy code

```kotlin
data class LineItem(val description: String, val amount: Double)

object InvoiceCalculator {

    fun totalAmount(items: List<LineItem>): Double {
        return items.fold(0) { acc, item ->
            acc + item.amount
        }
    }
}
```
