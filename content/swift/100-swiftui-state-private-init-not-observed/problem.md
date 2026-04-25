---
slug: swiftui-state-private-init-not-observed
track: swift
orderIndex: 100
title: StateObject Not Observing Passed Model
difficulty: hard
tags:
  - swiftui
  - state-management
  - observed-object
  - correctness
language: swift
---

## Context

This code is in `ProductDetailView.swift`. The view receives a `ProductViewModel` created by a parent coordinator and displays live inventory count. The parent updates the view model's `inventoryCount` when a WebSocket message arrives. The view is expected to re-render when inventory changes.

QA finds that inventory count never updates on screen after the first render, even though the coordinator's logs confirm the `@Published` property is being mutated. Adding a print statement inside the view model's `didSet` confirms the property changes are happening. Breakpoints in the view's `body` show it is never re-evaluated after the first render.

The team checked that `inventoryCount` is `@Published`, that the view model class conforms to `ObservableObject`, and that the view is using a property wrapper. They believe they are using `@StateObject` correctly because "it's for observing objects."

## Buggy code

```swift
import SwiftUI
import Combine

class ProductViewModel: ObservableObject {
    @Published var inventoryCount: Int
    let productName: String

    init(productName: String, initialCount: Int) {
        self.productName = productName
        self.inventoryCount = initialCount
    }
}

struct ProductDetailView: View {
    @StateObject private var viewModel: ProductViewModel

    init(viewModel: ProductViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        VStack {
            Text(viewModel.productName)
            Text("In stock: \(viewModel.inventoryCount)")
        }
    }
}
```
