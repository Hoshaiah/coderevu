## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — NavigationLink Destination Eagerly Initialized
// ------------------------------------------------------------------------

import SwiftUI

struct ProductListView: View {
    let products: [Product]

    var body: some View {
        NavigationStack {
            List(products, id: \.id) { product in
                // CHANGE 1: Use the value-based NavigationLink(value:) + navigationDestination(for:) pattern so the destination view is only instantiated when the user taps the row, not eagerly for every row in the list.
                NavigationLink(value: product.id) {
                    ProductRowView(product: product)
                }
            }
            .navigationTitle("Products")
            // CHANGE 1: navigationDestination(for:) lazily builds ProductDetailView only for the product the user actually navigated to.
            .navigationDestination(for: String.self) { productID in
                ProductDetailView(productID: productID)
            }
        }
    }
}

class ProductDetailViewModel: ObservableObject {
    @Published var detail: ProductDetail?
    // CHANGE 2: Remove the network fetch from init; defer it to an explicit load() call triggered from onAppear so it only runs when the view is actually presented.
    init() {}

    func load(productID: String) async {
        detail = try? await APIClient.shared.fetchProductDetail(id: productID)
    }
}

struct ProductDetailView: View {
    let productID: String
    // CHANGE 2: @StateObject is now initialized with a plain cheap init so constructing ProductDetailView does not start any network work.
    @StateObject private var viewModel = ProductDetailViewModel()

    init(productID: String) {
        self.productID = productID
    }

    var body: some View {
        Text(viewModel.detail?.name ?? "Loading...")
            // CHANGE 2: onAppear triggers the fetch exactly once, when the destination view is actually shown to the user.
            .task {
                await viewModel.load(productID: productID)
            }
    }
}
```

## Explanation

### Issue 1: Eager NavigationLink Destination Initialization

**Problem:** When `ProductListView` renders its `List`, SwiftUI evaluates the `destination:` argument of every `NavigationLink` immediately, constructing one `ProductDetailView` per row. With 200 products this means 200 `ProductDetailViewModel` inits run before the user taps anything, each launching a network request.

**Fix:** Replace `NavigationLink(destination: ProductDetailView(productID:))` with `NavigationLink(value: product.id)` combined with a `.navigationDestination(for: String.self)` modifier. The destination closure is only invoked for the single product the user tapped.

**Explanation:** SwiftUI's `destination:`-based `NavigationLink` is an older API that treats its destination argument as a regular Swift expression — it is evaluated every time the enclosing `body` is called and the view is diffed. The newer `NavigationLink(value:)` + `navigationDestination(for:)` API separates the tap target from the destination builder: the builder closure runs lazily, only when the navigation stack actually pushes that route. This collapses 200 simultaneous requests to at most 1 per user tap. A related pitfall: even with the fix, if the destination closure itself does expensive work synchronously it will still block the push animation, so keeping `ProductDetailView.init` cheap (as the team confirmed) remains important.

---

### Issue 2: Network Fetch Triggered Inside @StateObject Initializer

**Problem:** `ProductDetailViewModel.init(productID:)` immediately spawns a `Task` that calls `APIClient.shared.fetchProductDetail`. Any code path that constructs the view model — including SwiftUI diffing the view tree during structural evaluations — causes a network request, even if the view is never displayed.

**Fix:** Remove the `Task { await self.load(productID:) }` call from `ProductDetailViewModel.init`, make `load(productID:)` internal instead of private, and call it from a `.task { }` modifier on the view's body. `ProductDetailViewModel.init` becomes a no-op, and the fetch only runs when SwiftUI mounts the view on screen.

**Explanation:** `@StateObject(wrappedValue:)` requires you to pass an already-constructed instance of the object. That means `ProductDetailViewModel(productID:)` must run synchronously before `StateObject` can store it. SwiftUI can call a view's `init` more times than the view is actually inserted into the live view hierarchy — for example during list cell prefetching or speculative layout passes. If the object's own `init` starts async work, that work fires every time, with no cancellation. Moving the fetch into `.task { }` ties it to the view's actual appearance on screen, and SwiftUI automatically cancels the task when the view disappears, giving correct lifecycle behavior for free.
