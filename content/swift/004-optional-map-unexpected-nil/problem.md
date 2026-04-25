---
slug: optional-map-unexpected-nil
track: swift
orderIndex: 4
title: Optional Map Silently Drops Value
difficulty: easy
tags:
  - optionals
  - functional
  - correctness
language: swift
---

## Context

This utility function lives in `PriceFormatter.swift`, a shared formatting layer used across a retail iOS app. It takes an optional `Decimal` price from a product model and returns a formatted string for display. The function is called from multiple view models and a widget extension. The project uses Foundation's `NumberFormatter`.

Product cards occasionally show a blank price label instead of the formatted value. The issue is intermittent and seems to affect only products that have a price of exactly `0.00`. Prices like `1.99` or `99.00` always format correctly. The bug was introduced during a refactor that switched from an explicit `if let` to a more "functional" style using `map`.

The team added logging and confirmed that `price` is non-nil and equals `0.0` for the affected products, yet the label still ends up empty.

## Buggy code

```swift
import Foundation

func formatPrice(_ price: Decimal?) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.locale = Locale.current

    return price
        .map { formatter.string(from: $0 as NSDecimalNumber) }
        .flatMap { $0 }
        ?? "N/A"
}

// Called from view model:
// label.text = formatPrice(product.price)
```
