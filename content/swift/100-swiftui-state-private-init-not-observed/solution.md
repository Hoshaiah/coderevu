## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — StateObject Not Observing Passed Model
// ------------------------------------------------------------------------

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
    // CHANGE 1: Replace @StateObject with @ObservedObject so SwiftUI subscribes to the externally-owned view model and re-renders on every @Published change instead of ignoring updates after first render.
    @ObservedObject var viewModel: ProductViewModel

    // CHANGE 2: Remove the custom init that wrapped the external object in StateObject(wrappedValue:); with @ObservedObject the memberwise init is correct and SwiftUI does not swallow subsequent updates.
    init(viewModel: ProductViewModel) {
        self.viewModel = viewModel
    }

    var body: some View {
        VStack {
            Text(viewModel.productName)
            Text("In stock: \(viewModel.inventoryCount)")
        }
    }
}
```

## Explanation

### Issue 1: @StateObject discards external mutations

**Problem:** After the first render, `inventoryCount` never updates on screen. The coordinator logs confirm the property is being set and `didSet` fires, but the view's `body` is never called again.

**Fix:** Replace `@StateObject private var viewModel: ProductViewModel` with `@ObservedObject var viewModel: ProductViewModel` (CHANGE 1), and update the `init` to assign directly with `self.viewModel = viewModel` (CHANGE 2).

**Explanation:** `@StateObject` is designed for objects that the view itself creates and owns for its entire lifetime. When you pass an already-created object into `StateObject(wrappedValue:)`, SwiftUI only uses that value the very first time the view is initialized in a given view-tree position. On every subsequent render, SwiftUI silently discards the initializer argument and keeps its own internally-stored copy — which is the same instance but is no longer the one the coordinator is mutating if the view is recreated. More importantly, SwiftUI does not re-subscribe or re-wire Combine cancellables when the `wrappedValue` argument changes. `@ObservedObject` is the correct wrapper for objects owned and supplied by a parent: SwiftUI subscribes to `objectWillChange` and re-renders `body` on every emission, which is exactly what the coordinator's WebSocket updates need.

---

### Issue 2: Ownership semantics mismatch with @StateObject

**Problem:** Even if the view happens to hold a reference to the correct instance, using `@StateObject` for an externally-owned object means the view claims ownership. If SwiftUI destroys and recreates the view struct (e.g., during a parent re-render), `@StateObject` creates a brand-new instance via the initializer closure instead of reusing the coordinator's instance, so the view ends up observing a detached object that never receives WebSocket updates.

**Fix:** The `init` is simplified at CHANGE 2 to assign `self.viewModel = viewModel` directly, which is the standard pattern for `@ObservedObject` — the view stores a reference to the caller-supplied object without claiming ownership or controlling its lifetime.

**Explanation:** `@StateObject` ties the object's lifetime to the view's position in the view hierarchy. SwiftUI constructs the object once and keeps it alive as long as that view-tree position exists. When you force-inject an external object via `StateObject(wrappedValue:)`, you break this contract: the wrapped-value path is only evaluated at first insertion, so any subsequent structural changes that cause SwiftUI to re-init the view struct will produce a new `ProductViewModel` disconnected from the coordinator. `@ObservedObject` does not manage lifetime — it just subscribes to the object you hand it each time the view initializes, so it always points at the coordinator's live instance.
