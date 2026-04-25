---
slug: swiftui-navigationlink-eager-init
track: swift
orderIndex: 95
title: NavigationLink Destination Eagerly Initialized
difficulty: hard
tags:
  - swiftui
  - performance
  - navigation
  - state
language: swift
---

## Context

`Views/ProductListView.swift` renders a large catalogue of products in a `List`. Each row contains a `NavigationLink` that pushes a `ProductDetailView`. `ProductDetailView` creates a `@StateObject` view model that performs a network fetch in its initializer to pre-load product details.

The product list screen hangs for several seconds on first load and the network tab in Instruments shows dozens or hundreds of simultaneous requests firing immediately when the list appears — before the user has tapped anything. On a list of 200 products, 200 network requests are launched at once, saturating the connection pool and making the initial page render extremely slow.

The team confirmed that `ProductDetailView.init` is cheap. They traced the requests to the `@StateObject`'s wrapped type initializer being called far more times than expected. They assumed SwiftUI only initialises the destination view when the link is tapped.

## Buggy code

```swift
import SwiftUI

struct ProductListView: View {
    let products: [Product]

    var body: some View {
        NavigationStack {
            List(products, id: \.id) { product in
                NavigationLink(destination: ProductDetailView(productID: product.id)) {
                    ProductRowView(product: product)
                }
            }
            .navigationTitle("Products")
        }
    }
}

class ProductDetailViewModel: ObservableObject {
    @Published var detail: ProductDetail?

    init(productID: String) {
        // Kicks off a network request immediately on init
        Task { await self.load(productID: productID) }
    }

    private func load(_ productID: String) async {
        detail = try? await APIClient.shared.fetchProductDetail(id: productID)
    }
}

struct ProductDetailView: View {
    @StateObject private var viewModel: ProductDetailViewModel

    init(productID: String) {
        _viewModel = StateObject(wrappedValue: ProductDetailViewModel(productID: productID))
    }

    var body: some View {
        Text(viewModel.detail?.name ?? "Loading...")
    }
}
```
