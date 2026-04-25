---
slug: swiftui-sheet-binding-wrong-optional
track: swift
orderIndex: 77
title: Sheet Item Binding Always Presents
difficulty: easy
tags:
  - swiftui
  - optionals
  - sheet
  - binding
language: swift
---

## Context

This code is in `OrderHistoryView.swift`, a SwiftUI view showing a list of past orders. Tapping a row should present a detail sheet for that order. The team uses the `sheet(item:)` modifier, which takes an `Optional` binding and presents the sheet when the binding is non-nil.

QA reports that the detail sheet opens immediately when `OrderHistoryView` first appears on screen, before the user taps anything. The sheet's content shows a placeholder/empty order rather than a real one. Users are confused and the bug has a 100% reproduction rate on first launch of the screen.

The team confirmed the sheet presentation logic looks correct and that `selectedOrder` is not being mutated anywhere in `onAppear`. They inspected the binding passed to `sheet(item:)` but did not notice the structural issue.

## Buggy code

```swift
struct Order: Identifiable {
    let id: UUID
    let total: Double
    let date: Date
}

struct OrderHistoryView: View {
    @State private var orders: [Order] = []
    @State private var selectedOrder: Order? = Order(
        id: UUID(),
        total: 0.0,
        date: .now
    )

    var body: some View {
        List(orders) { order in
            Button(order.id.uuidString) {
                selectedOrder = order
            }
        }
        .sheet(item: $selectedOrder) { order in
            OrderDetailView(order: order)
        }
    }
}
```
