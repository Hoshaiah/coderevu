## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — SwiftUI @State Ignores Parent Updates
// ------------------------------------------------------------------------

import SwiftUI

struct FilterPanel: View {
    // CHANGE 1: Replace @State + plain String with @Binding so the parent's source of truth drives the field directly; parent updates now propagate instantly.
    @Binding var localFilter: String

    // CHANGE 1: Remove the custom init that seeded @State — @Binding is wired automatically by SwiftUI from the parent's $filter.
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Filter")
                .font(.headline)
            TextField("Search...", text: $localFilter)
                .textFieldStyle(.roundedBorder)
            Text("Current: \(localFilter)")
                .foregroundColor(.secondary)
        }
        .padding()
    }
}

struct ContentView: View {
    @State private var filter = "swift"

    var body: some View {
        VStack {
            // CHANGE 2: Pass $filter (a Binding<String>) instead of the plain value filter, so FilterPanel receives a two-way reference to the parent's @State.
            FilterPanel(localFilter: $filter)
            Button("Clear Filters") {
                filter = ""
            }
        }
    }
}
```

## Explanation

### Issue 1: @State Ignores Parent Re-renders

**Problem:** When the parent sets `filter = ""`, `FilterPanel` is re-initialized with the new value, but the `TextField` does not clear. The user sees the old text remain no matter how many times the parent resets the value.

**Fix:** Replace `@State private var localFilter: String` and its custom `init` with `@Binding var localFilter: String`. Remove the `init(filter:)` entirely; SwiftUI synthesizes the correct memberwise initializer for a `@Binding` property automatically.

**Explanation:** `@State` is designed to be owned by the view that declares it. SwiftUI creates the underlying storage the very first time the view is inserted into the hierarchy, and the `State(initialValue:)` call in `init` only affects that first creation. Every subsequent re-render calls `init` again, but SwiftUI detects that the view is already alive and simply discards the new `initialValue` — the storage is never touched. `@Binding`, by contrast, holds a reference to storage that lives in the parent (`@State private var filter`). Every read or write through the binding goes directly to the parent's storage, so when the parent sets `filter = ""`, the binding reflects the change immediately and the `TextField` redraws with the empty string.

---

### Issue 2: Child Edits Not Propagated to Parent

**Problem:** Even setting aside the reset problem, with the original `@State`-plus-plain-`String` design any text the user types inside `FilterPanel` is invisible to the parent. The parent's `filter` variable stays at its last-set value, which can cause state inconsistencies when the parent reads `filter` expecting the user's latest input.

**Fix:** At the call site in `ContentView`, change `FilterPanel(filter: filter)` to `FilterPanel(localFilter: $filter)`, passing the binding projection `$filter` so that writes in the child update the parent's `@State` directly.

**Explanation:** Passing a plain `String` is a value copy — the child gets its own independent copy of the characters, and nothing links that copy back to the parent. With `@Binding`, the child and parent share one storage location. A keystroke in the `TextField` writes through `$localFilter` to the parent's `filter`, and the parent's `filter` writes (like a "Clear Filters" tap) flow back to the child for the same reason. A related pitfall: if you wanted to keep a local draft and only commit on "Apply", you would copy the binding value into `@State` on `onAppear` and push it back on button tap — but that pattern still requires the binding for the push-back step.
