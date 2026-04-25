## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Non-Unique List Identifiers Crash
// ------------------------------------------------------------------------

import SwiftUI

struct CartItem: Identifiable {
    // CHANGE 1: Add a stable per-line-item UUID assigned at init, not derived from productID, so duplicate SKUs each get a unique id without regenerating on every state change.
    let lineItemID: UUID
    let productID: String   // e.g. "SKU-1234"
    var quantity: Int
    var unitPrice: Double

    // CHANGE 2: Use lineItemID as the Identifiable id so SwiftUI's List sees each row as distinct, even when multiple rows share the same productID.
    var id: UUID { lineItemID }

    // CHANGE 1 (cont): Provide a memberwise init with a defaulted UUID so callers can omit it and still get a stable, unique value per line item.
    init(lineItemID: UUID = UUID(), productID: String, quantity: Int, unitPrice: Double) {
        self.lineItemID = lineItemID
        self.productID = productID
        self.quantity = quantity
        self.unitPrice = unitPrice
    }
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
        CartItem(productID: "SKU-1234", quantity: 3, unitPrice: 8.49), // no longer a duplicate — each has its own lineItemID
        CartItem(productID: "SKU-5678", quantity: 2, unitPrice: 4.99)
    ]
}
```

## Explanation

### Issue 1: Non-unique `id` causes List crash

**Problem:** `CartItem.id` returns `productID`. When two cart entries share the same SKU (e.g., a single and a 3-pack of "SKU-1234"), SwiftUI's `List` receives two items with identical identifiers. On iOS 16+, the diffing engine enforces uniqueness strictly and throws `Fatal error: each layout item may only occur once` as soon as the list renders or updates.

**Fix:** A `lineItemID: UUID` stored property is added to `CartItem` and `id` is changed to return `lineItemID` instead of `productID`. Each `CartItem` instance now carries its own identifier that is independent of the product it represents.

**Explanation:** SwiftUI's `List` (and `ForEach`) use the `Identifiable` id to track which cell corresponds to which data item across renders. When two items share an id, the framework cannot build a stable mapping and asserts. The root cause is that `productID` identifies a *product*, not a *line item* — a cart can legitimately contain the same product more than once. Using a `UUID` scoped to the line item rather than the product breaks that coupling. The UUID must be stored as a `let` property (assigned once at init) rather than computed with `UUID()` inline, because a computed property would produce a new value on every access, breaking identity tracking during animations and diffing.

---

### Issue 2: UUID must be stable across state changes

**Problem:** The team's concern about using `UUID()` was valid in one specific form: if `id` were implemented as `var id: UUID { UUID() }`, every call to `id` would return a different value. SwiftUI reads `id` repeatedly during layout and diffing, so each read would look like a brand-new item, causing cells to be recreated constantly and animations to break.

**Fix:** `lineItemID` is declared as a `let` constant initialized once in `init(lineItemID: UUID = UUID(), ...)`. The `id` computed property reads this stored constant, so it returns the same value for the lifetime of the struct.

**Explanation:** Swift structs are value types, so every assignment copies all stored properties including `lineItemID`. As long as the `CartItem` value in the array is replaced (not discarded and re-created from scratch), its `lineItemID` stays the same and SwiftUI treats it as the same row. The `= UUID()` default argument in the init is evaluated once per call site, not once globally, so each newly constructed `CartItem` gets a fresh unique id. If items are loaded from SQLite, the caller should persist and reload the `lineItemID` alongside the other columns so identity survives app restarts; otherwise every cold launch will regenerate ids and lose scroll position or selection state.
