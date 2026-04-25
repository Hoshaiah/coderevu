## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — EnvironmentObject Replaced But View Stale
// ------------------------------------------------------------------------

import SwiftUI
import Combine

class CartStore: ObservableObject {
    @Published var items: [String] = []
}

// CHANGE 1: Use @StateObject instead of @State to hold CartStore — @StateObject is designed for reference-type ObservableObject ownership; replacing it via a wrapping @State id trick is needed because SwiftUI does not re-inject a new environmentObject reference automatically.
struct RootView: View {
    // CHANGE 1: Replace @State private var cartStore = CartStore() with an @StateObject; we drive identity reset via a separate @State id so SwiftUI tears down and rebuilds the subtree.
    @StateObject private var cartStore = CartStore()
    @State private var isLoggedIn: Bool = true
    // CHANGE 2: Add a cartStoreID that we increment to force SwiftUI to destroy and recreate the child view hierarchy (including its environmentObject slot) whenever we swap accounts.
    @State private var cartStoreID: UUID = UUID()

    var body: some View {
        if isLoggedIn {
            TabView {
                CartView()
                    .tabItem { Label("Cart", systemImage: "cart") }
            }
            // CHANGE 2: Apply .id(cartStoreID) so that when cartStoreID changes, SwiftUI tears down the entire TabView subtree and rebuilds it, forcing CartView to pick up the fresh CartStore from environmentObject.
            .id(cartStoreID)
            .environmentObject(cartStore)
            .onReceive(NotificationCenter.default.publisher(for: .userDidLogout)) { _ in
                // CHANGE 1: Instead of reassigning @State var directly (which doesn't work for reference types), call a mutating method on the existing CartStore to reset it, then rotate the id to force view hierarchy rebuild.
                cartStore.items = []
                cartStoreID = UUID()
                isLoggedIn = false
            }
            .onReceive(NotificationCenter.default.publisher(for: .userDidLogin)) { _ in
                // CHANGE 1: Same pattern on login — reset the shared CartStore's state and rotate the id so all child views re-subscribe cleanly.
                cartStore.items = []
                cartStoreID = UUID()
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

## Explanation

### Issue 1: @State cannot own ObservableObject references

**Problem:** `@State private var cartStore = CartStore()` stores a reference-type object using a property wrapper meant for value types. When the code does `cartStore = CartStore()` inside an `onReceive` closure, SwiftUI sees the `@State` storage change but does not automatically propagate the new object instance down into child views' `@EnvironmentObject` slots. `CartView` keeps observing the old `CartStore` instance and keeps displaying the previous cart.

**Fix:** Replace `@State` with `@StateObject` for owning the `CartStore`, and instead of allocating a new instance, reset the existing object's `items` array directly via `cartStore.items = []`. The `@StateObject` wrapper is the correct tool for owning reference-type `ObservableObject` instances in a SwiftUI view.

**Explanation:** SwiftUI's `@EnvironmentObject` injection works by passing the object reference into the environment dictionary keyed by type. When you replace the `@State` variable holding `CartStore`, SwiftUI updates the environment value, but child views that already established their `@EnvironmentObject` binding during their initial render may not see the swap until their body is re-evaluated. Because the old `CartStore` object is still alive and still publishing, `CartView` remains subscribed to it and shows stale data. Mutating `cartStore.items = []` on the existing `@StateObject`-owned instance triggers a `@Published` change that every observer — including `CartView` and the tab badge — receives immediately. The edge case to watch: if you genuinely need a completely fresh object (e.g., different type state), use the `.id()` trick described in Issue 2 alongside resetting the object.

---

### Issue 2: Stale view hierarchy not rebuilt after account switch

**Problem:** Even after resetting `cartStore.items`, the SwiftUI view hierarchy for the `TabView` and its children retains its previous identity. SwiftUI does not automatically destroy and recreate `CartView` when the environment changes, so subscriptions and any local view state inside child views remain tied to the old render cycle. The cart count badge in the tab bar is especially prone to this because it reads from the environment at render time.

**Fix:** Add a `@State private var cartStoreID: UUID = UUID()` property and apply `.id(cartStoreID)` to the `TabView`. In each `onReceive` closure, set `cartStoreID = UUID()` after resetting the cart. This forces SwiftUI to tear down and reconstruct the entire `TabView` subtree.

**Explanation:** SwiftUI uses view identity to decide whether to update an existing view or replace it. When `.id()` receives a new value, SwiftUI treats the view as a completely different element: it destroys the old one and creates a fresh one, which means `CartView` goes through its initialization path again and picks up the current environment object from scratch. Without this, SwiftUI may diff the old and new view trees and decide the `TabView` is the same node, preserving its children's state. Rotating `UUID` on every account switch is a deliberate, controlled way to opt out of SwiftUI's identity preservation for that subtree. Be aware that `.id()` also resets any local `@State` inside child views, which is usually the desired behavior after an account switch but should be considered explicitly.
