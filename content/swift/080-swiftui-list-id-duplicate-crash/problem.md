---
slug: swiftui-list-id-duplicate-crash
track: swift
orderIndex: 80
title: Non-Unique List Identifiers Crash
difficulty: medium
tags:
  - swiftui
  - state
  - correctness
language: swift
---

## Context

This view lives in `CartView.swift` in a shopping app. It renders a list of cart line items using SwiftUI's `List`. Line items come from a `CartViewModel` that fetches from a local SQLite cache. Each `CartItem` conforms to `Identifiable` using its `productID` as the identifier. The view model is a `@StateObject` on the root view.

Users who add the same product to the cart multiple times (e.g., a 3-pack and a single of the same item, both having the same `productID`) see the app crash with `Fatal error: each layout item may only occur once`. Even users who add two separate items that happen to share a product ID (a variant product mapped to the same base ID) are affected. The crash only appears on iOS 16+ when scrolling or when items are added/removed dynamically.

The team considered using `UUID()` directly in the model but was worried about SwiftUI recreating cells on every state change. They need a stable, unique identifier per *line item*, not per *product*.

## Buggy code

```swift
import SwiftUI

struct CartItem: Identifiable {
    let productID: String   // e.g. "SKU-1234"
    var quantity: Int
    var unitPrice: Double

    // Identifiable conformance uses productID — not unique when
    // the same product appears multiple times
    var id: String { productID }
}

struct CartView: View {
    @StateObject private var viewModel = CartViewModel()

    var body: some View {
        List(viewModel.items) { item in
            HStack {
                Text(item.productID)
                Spacer()
                Text("x\(item.quantity)")
                Text(String(format: "$%.2f", item.unitPrice))
            }
        }
        .navigationTitle("Cart")
    }
}

class CartViewModel: ObservableObject {
    @Published var items: [CartItem] = [
        CartItem(productID: "SKU-1234", quantity: 1, unitPrice: 9.99),
        CartItem(productID: "SKU-1234", quantity: 3, unitPrice: 8.49), // duplicate!
        CartItem(productID: "SKU-5678", quantity: 2, unitPrice: 4.99)
    ]
}
```
