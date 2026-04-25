## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — ObservableObject Recreated on Redraw
// ------------------------------------------------------------------------

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
    // CHANGE 1: Use @StateObject instead of @ObservedObject so SwiftUI owns and persists the instance across redraws; the initializer runs only once for the lifetime of this view in the hierarchy.
    @StateObject var viewModel = OrderViewModel()

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

## Explanation

### Issue 1: `@ObservedObject` Recreates View Model on Redraw

**Problem:** Every time the parent view redraws — triggered by a timer, an environment change, or any unrelated state update — SwiftUI reconstructs `OrderFormView` as a new value type. Because the `viewModel` property uses `@ObservedObject` with an inline `= OrderViewModel()` initializer, a brand-new `OrderViewModel` is allocated and the old one (with the user's typed text) is thrown away. Users see fields randomly clear mid-input.

**Fix:** Replace `@ObservedObject var viewModel = OrderViewModel()` with `@StateObject var viewModel = OrderViewModel()` at the `CHANGE 1` site. `@StateObject` is the only change required.

**Explanation:** SwiftUI views are structs that are recreated frequently — they are cheap value types, not persistent objects. `@ObservedObject` tells SwiftUI "I will give you an object to watch, but you don't own it". When the struct is re-initialised, the `= OrderViewModel()` expression runs again, producing a fresh instance with empty fields. `@StateObject` tells SwiftUI "create this object once and keep it alive for as long as this view identity exists in the hierarchy". SwiftUI stores the instance in stable internal storage tied to the view's identity, so the initializer expression only runs on the very first insertion into the view tree. A related pitfall: if you inject a view model from a parent (e.g. `init(viewModel: OrderViewModel)`), `@ObservedObject` is correct there because the parent already owns the instance — the problem only occurs when the view is responsible for creating the object itself.

---
