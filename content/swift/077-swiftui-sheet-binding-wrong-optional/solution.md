## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Sheet Item Binding Always Presents
// ------------------------------------------------------------------------

struct Order: Identifiable {
    let id: UUID
    let total: Double
    let date: Date
}

struct OrderHistoryView: View {
    // CHANGE 2: Populate orders with sample data so the list is not empty and tapping a row shows real order data instead of a blank placeholder.
    @State private var orders: [Order] = [
        Order(id: UUID(), total: 29.99, date: .now),
        Order(id: UUID(), total: 14.50, date: .now)
    ]
    // CHANGE 1: Initialize selectedOrder as nil so no sheet is presented on first render; the sheet only appears after the user taps a row and selectedOrder is set.
    @State private var selectedOrder: Order? = nil

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

## Explanation

### Issue 1: Non-nil Default Triggers Immediate Sheet

**Problem:** The sheet opens the moment `OrderHistoryView` appears on screen. The user sees a detail view for a dummy order they never selected. This happens on every first launch of the screen with a 100% reproduction rate.

**Fix:** Change the `@State private var selectedOrder` initializer from `Order(id: UUID(), total: 0.0, date: .now)` to `nil`.

**Explanation:** `sheet(item:)` observes the binding it receives and presents the sheet whenever that binding holds a non-nil value. Because `selectedOrder` is set to a real `Order` instance at declaration time, SwiftUI sees a non-nil binding on the very first layout pass and immediately triggers the sheet presentation. Setting the initial value to `nil` means no sheet is shown until the user taps a row and the button handler assigns a real order to `selectedOrder`. A related pitfall: if you ever want to reset the sheet, make sure to set `selectedOrder` back to `nil`; leaving it set to the last-tapped order would cause the sheet to reappear if the view is re-rendered.

---

### Issue 2: Empty Orders Array Shows No Rows

**Problem:** The `orders` array starts empty, so the `List` renders no rows at all. Even after fixing Issue 1, the screen would be blank and the user would have no orders to tap.

**Fix:** Replace `@State private var orders: [Order] = []` with an array pre-populated with sample `Order` instances, as shown at the `CHANGE 2` site.

**Explanation:** `List(orders)` iterates over whatever the `orders` array contains at render time. An empty array produces an empty list with nothing tappable. In production this array would be loaded from a network call or a local database, but the view needs at least a data-loading mechanism (e.g., `.task { orders = await fetchOrders() }`) to populate it. Providing sample data here makes the fix self-contained and immediately testable. The root cause of the sheet showing a zeroed-out order in the original bug was also this empty array: the dummy `selectedOrder` initializer filled the gap with synthetic data that looked like a real order but had no meaningful fields.
