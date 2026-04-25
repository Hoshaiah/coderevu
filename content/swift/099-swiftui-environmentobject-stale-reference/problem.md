---
slug: swiftui-environmentobject-stale-reference
track: swift
orderIndex: 99
title: EnvironmentObject Replaced But View Stale
difficulty: hard
tags:
  - swiftui
  - memory
  - observableobject
  - environment
language: swift
---

## Context

This code is in `RootView.swift` and `CartView.swift` of a shopping app. A `CartStore` observable object is injected via `.environmentObject()`. When the user logs out and logs in as a different account, the root view creates a brand new `CartStore` instance and re-injects it. The intent is that `CartView` and all child views automatically see the new, empty cart.

Bug reports show that after switching accounts, `CartView` still displays the previous user's cart items for several seconds — or until the user navigates away and back. The cart count badge in the tab bar also shows stale data. Logging confirms the new `CartStore` instance is created and its `items` array is empty.

The team verified that `@EnvironmentObject` is used (not `@ObservedObject`), so they expected SwiftUI to propagate the new instance automatically. They ruled out caching at the network layer.

## Buggy code

```swift
import SwiftUI
import Combine

class CartStore: ObservableObject {
    @Published var items: [String] = []
}

struct RootView: View {
    @State private var cartStore = CartStore()
    @State private var isLoggedIn: Bool = true

    var body: some View {
        if isLoggedIn {
            TabView {
                CartView()
                    .tabItem { Label("Cart", systemImage: "cart") }
            }
            .environmentObject(cartStore)
            .onReceive(NotificationCenter.default.publisher(for: .userDidLogout)) { _ in
                cartStore = CartStore()
                isLoggedIn = false
            }
            .onReceive(NotificationCenter.default.publisher(for: .userDidLogin)) { _ in
                cartStore = CartStore()
                isLoggedIn = true
            }
        }
    }
}

struct CartView: View {
    @EnvironmentObject var cartStore: CartStore

    var body: some View {
        List(cartStore.items, id: \.self) { item in
            Text(item)
        }
        .navigationTitle("Cart (\(cartStore.items.count))")
    }
}

extension Notification.Name {
    static let userDidLogout = Notification.Name("userDidLogout")
    static let userDidLogin  = Notification.Name("userDidLogin")
}
```
