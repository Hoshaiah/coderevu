---
slug: class-value-copy-mutation-lost
track: swift
orderIndex: 26
title: Struct Mutation Lost After Copy
difficulty: easy
tags:
  - memory
  - value-semantics
  - correctness
  - structs
language: swift
---

## Context

This code is in `CartManager.swift`, a simple shopping cart that stores `CartItem` structs in an array owned by a reference-type manager. The `updateQuantity` method is called from a table view cell's stepper control and is supposed to persist the new quantity to the in-memory cart before the order is placed.

Customers report that changing item quantities in the cart has no effect — when the order is placed, all quantities are at their original values. No crash, no assertion, no log output indicating a problem. The bug is 100% reproducible on all devices.

The developer added a `print` statement after the mutation and confirmed the local variable shows the updated quantity. The confusion is that the array itself never reflects the change.

## Buggy code

```swift
import Foundation

struct CartItem {
    var productID: String
    var quantity: Int
    var price: Double
}

final class CartManager {
    private(set) var items: [CartItem] = []

    func addItem(_ item: CartItem) {
        items.append(item)
    }

    func updateQuantity(for productID: String, quantity: Int) {
        guard var item = items.first(where: { $0.productID == productID }) else {
            return
        }
        item.quantity = quantity
        print("Updated quantity to \(item.quantity) for \(item.productID)")
    }

    func totalPrice() -> Double {
        items.reduce(0) { $0 + $1.price * Double($1.quantity) }
    }
}
```
