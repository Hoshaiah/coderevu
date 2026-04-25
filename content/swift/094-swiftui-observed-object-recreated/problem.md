---
slug: swiftui-observed-object-recreated
track: swift
orderIndex: 94
title: ObservableObject Recreated on Redraw
difficulty: hard
tags:
  - swiftui
  - state
  - memory
  - correctness
language: swift
---

## Context

This code is in `OrderFormView.swift`, a SwiftUI form where users enter order details. The form has several fields and uses a dedicated `OrderViewModel` to hold validation state and business logic. The view model is instantiated inline in the view's property list.

Users report that typing in one field causes others to randomly reset to empty. The bug is intermittent and correlates with how many other views are updating at the same time (for example, a timer updating a progress bar elsewhere in the hierarchy). It does not reproduce in isolation.

The team confirmed that `OrderViewModel`'s logic is correct in unit tests. Adding logging shows the view model's `init` being called far more often than expected — sometimes dozens of times per second.

## Buggy code

```swift
import SwiftUI
import Combine

final class OrderViewModel: ObservableObject {
    @Published var customerName = ""
    @Published var address = ""
    @Published var quantity = 1

    func isValid() -> Bool {
        !customerName.isEmpty && !address.isEmpty && quantity > 0
    }
}

struct OrderFormView: View {
    @ObservedObject var viewModel = OrderViewModel()

    var body: some View {
        Form {
            TextField("Name", text: $viewModel.customerName)
            TextField("Address", text: $viewModel.address)
            Stepper("Qty: \(viewModel.quantity)", value: $viewModel.quantity, in: 1...99)
            Button("Place Order") {
                guard viewModel.isValid() else { return }
            }
            .disabled(!viewModel.isValid())
        }
    }
}
```
