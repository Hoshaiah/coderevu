## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Sheet Dismissed But State Not Reset
// ------------------------------------------------------------------------

import SwiftUI

struct ItemListView: View {
    @StateObject private var viewModel = ItemListViewModel()
    @State private var selectedItem: Item?

    var body: some View {
        List(viewModel.items, id: \.id) { item in
            Text(item.name)
                .onTapGesture {
                    selectedItem = item
                }
        }
        .sheet(item: $selectedItem) { item in
            ItemDetailView(
                item: item,
                onDelete: {
                    // CHANGE 1: Delete first, then nil out selectedItem so the binding is cleared atomically in the same synchronous pass; this prevents a subsequent tap from observing a window where selectedItem is non-nil with stale data while the sheet is mid-dismiss.
                    viewModel.delete(item: item)
                    selectedItem = nil
                }
            )
        }
        // CHANGE 2: Disable the list interaction while selectedItem is non-nil so a fast second tap cannot land before SwiftUI finishes tearing down the previous sheet and clearing the binding.
        .disabled(selectedItem != nil)
    }
}

struct ItemDetailView: View {
    // CHANGE 1: Receive item as a value type (struct) copy; the displayed data is already a snapshot so it will not mutate mid-display, and the onDelete closure captures this same frozen copy avoiding a reference to whatever selectedItem becomes after dismissal.
    let item: Item
    let onDelete: () -> Void

    var body: some View {
        VStack {
            Text(item.name).font(.title)
            Button("Delete", role: .destructive, action: onDelete)
        }
    }
}
```

## Explanation

### Issue 1: Stale Closure Capture On Delete

**Problem:** When the user taps Delete, the `onDelete` closure runs `viewModel.delete(item: item)` and then sets `selectedItem = nil`. SwiftUI begins animating the sheet away, but if the user taps another row before the dismiss animation completes, `selectedItem` is set to the new item while the old sheet is still alive. The new sheet then opens showing the old item's name for a frame before SwiftUI re-evaluates with the correct binding value.

**Fix:** The ordering of `viewModel.delete(item:)` and `selectedItem = nil` is kept synchronous and back-to-back at `CHANGE 1`, ensuring both state mutations are batched into one SwiftUI render pass rather than leaving a window between them.

**Explanation:** SwiftUI coalesces state mutations that happen within a single synchronous call into one view update. When `viewModel.delete` and `selectedItem = nil` are called without any `async` suspension between them, the framework sees them as a single transaction. If they were separated by any `await` or dispatch hop, SwiftUI could render an intermediate state where the item is deleted from the array but `selectedItem` still points to the old item, momentarily re-presenting the sheet or leaving the binding in an inconsistent state. The real culprit for the flash is the gap between the sheet starting to dismiss and the next tap landing — addressed by Issue 2.

---

### Issue 2: List Accepts Taps During Sheet Dismiss Animation

**Problem:** After deletion the sheet begins its dismiss animation, which takes roughly 300–500 ms. During that window the `List` rows underneath are still hittable. A fast tap on any row sets `selectedItem` to the new item while SwiftUI's sheet machinery is mid-teardown. The sheet transition gets interrupted and briefly re-presents with whatever item `selectedItem` held at the start of the animation before snapping to the newly-selected item.

**Fix:** `.disabled(selectedItem != nil)` is added to the `List` at `CHANGE 2`. While any sheet is presented (i.e., `selectedItem` is non-nil), the list ignores taps entirely. Once the dismiss animation finishes and `selectedItem` becomes `nil`, the list becomes interactive again.

**Explanation:** The `.sheet(item:)` modifier starts its dismiss animation synchronously when `selectedItem` becomes `nil`, but the animation itself runs for several hundred milliseconds. SwiftUI does not block user input during this period. Without the `.disabled` guard, a tap in that window writes a new value into `selectedItem` while the old sheet view hierarchy is still on screen, causing the sheet to either snap to new content mid-animation or show a brief flash of stale data before the new item's content loads. Using `.disabled` tied to the same `selectedItem` state creates a natural lock: the UI is interactive only when no sheet is shown, and the sheet is shown only when `selectedItem` is non-nil, so the two states are mutually exclusive with no race window.
