---
slug: optional-chaining-default-value-wrong
track: swift
orderIndex: 2
title: Nil Coalescing Hides Missing Optional
difficulty: easy
tags:
  - optionals
  - correctness
  - nil-coalescing
  - logic
language: swift
---

## Context

This code is in `CartViewModel.swift` in an e-commerce iOS app. It computes the total price of items in the cart. Each `CartItem` has an optional `discountedPrice` — set only when a promotional code is active — and a non-optional `basePrice`. The intended logic is: use `discountedPrice` when available, otherwise use `basePrice`.

Customers report that applying a promo code sometimes shows a lower total, but removing the promo code and re-adding items still shows the discounted total. QA found that the total is always the minimum of the two prices, even when no promo code is applied.

The bug was introduced when the developer refactored the calculation from a for-loop to a functional chain. The for-loop version was correct.

## Buggy code

```swift
struct CartItem {
    let name: String
    let basePrice: Double
    var discountedPrice: Double?
}

class CartViewModel: ObservableObject {
    @Published var items: [CartItem] = []

    var total: Double {
        items.reduce(0.0) { sum, item in
            sum + (item.discountedPrice ?? item.basePrice)
        }
    }

    var itemCount: Int { items.count }

    func applyDiscount(to index: Int, discountedPrice: Double) {
        guard items.indices.contains(index) else { return }
        items[index].discountedPrice = discountedPrice
    }

    func removeDiscount(from index: Int) {
        guard items.indices.contains(index) else { return }
        // Bug introduced here during refactor
        items[index].discountedPrice = items[index].discountedPrice ?? nil
    }
}
```
