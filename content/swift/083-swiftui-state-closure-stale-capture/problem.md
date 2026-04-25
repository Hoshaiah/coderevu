---
slug: swiftui-state-closure-stale-capture
track: swift
orderIndex: 83
title: Stale State Capture in Button Action
difficulty: medium
tags:
  - swiftui
  - state
  - closures
  - correctness
language: swift
---

## Context

This SwiftUI view lives in `CartView.swift` in an e-commerce app. It displays a list of cart items and a checkout button that applies a promo code the user types into a `TextField`. The view is part of a `NavigationStack` and can be pushed and popped freely.

Users report that after typing a promo code and tapping "Checkout", the order is sometimes submitted with an empty promo code even though the text field clearly shows the code they typed. The bug is intermittent and harder to reproduce on faster devices but reliably appears when the user types quickly and taps the button immediately.

Network logs confirm the POST body has `promoCode: ""` when the bug fires. The developer added print statements and found the `@State` variable shows the correct value inside the view body but appears empty inside the button's action closure.

## Buggy code

```swift
struct CartView: View {
    @State private var promoCode: String = ""
    let onCheckout: (String) -> Void

    var body: some View {
        VStack {
            TextField("Promo code", text: $promoCode)
                .textFieldStyle(.roundedBorder)

            Button("Checkout") {
                // BUG: capturing promoCode by value at the time the button
                // view was last rendered, not at the time the tap fires.
                let code = promoCode
                onCheckout(code)
            }
        }
        .padding()
    }
}
```
