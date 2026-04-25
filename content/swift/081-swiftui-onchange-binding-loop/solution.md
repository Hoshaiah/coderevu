## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — SwiftUI onChange Triggers Infinite Loop
// ------------------------------------------------------------------------

import SwiftUI

struct SearchView: View {
    @StateObject private var viewModel = SearchViewModel()
    @State private var query: String = ""

    var body: some View {
        NavigationStack {
            VStack {
                TextField("Search...", text: $query)
                    .textFieldStyle(.roundedBorder)
                    .padding()
                    // CHANGE 1: Use the two-parameter form (oldValue, newValue) and guard against writing back when the value is already normalised, breaking the infinite-loop cycle.
                    .onChange(of: query) { oldValue, newValue in
                        let normalised = newValue
                            .trimmingCharacters(in: .whitespaces)
                            .lowercased()
                        // CHANGE 2: Only assign back to `query` when the normalised string actually differs, preventing a redundant state write that would re-trigger onChange.
                        if normalised != newValue {
                            query = normalised
                        }
                        viewModel.search(query: normalised)
                    }

                List(viewModel.results, id: \.id) { result in
                    Text(result.title)
                }
            }
            .navigationTitle("Search")
        }
    }
}
```

## Explanation

### Issue 1: `onChange` writes back to its own observed value

**Problem:** Every time the user types a character, `onChange(of: query)` fires. Inside the handler, the code assigns `query = normalised`. That assignment changes `query`, which immediately triggers `onChange(of: query)` again. On iOS 16+ the runtime processes these mutations synchronously on the main thread in a tight loop, pegging CPU at 100% and producing the visible hang and garbled characters.

**Fix:** Replace the single-argument closure `.onChange(of: query) { newValue in ... }` with the two-argument form `.onChange(of: query) { oldValue, newValue in ... }` and wrap the `query = normalised` write inside `if normalised != newValue { ... }` (CHANGE 1 and CHANGE 2 together).

**Explanation:** SwiftUI's `onChange` modifier schedules another view update whenever the observed value changes. When the handler itself mutates that same value unconditionally, the mutation causes a new update, which fires the handler again, which mutates again — a cycle with no exit condition. The single-argument `.onChange` form available before iOS 17 does not guard against this automatically. The fix adds a guard: `if normalised != newValue` means the write-back only happens when the text actually needs normalising (e.g. the user typed an uppercase letter or a leading space). For already-normalised input — the common case after the first correction — `normalised == newValue` so no write occurs, the loop has no trigger, and the cycle never starts. A related pitfall: even with the guard, calling `query = normalised` when the values are equal would still trigger a re-render because SwiftUI's `@State` does not deduplicate writes for `String` in all configurations, so the equality check is load-bearing, not just an optimisation.

---

### Issue 2: Unconditional write-back performs redundant work on every keystroke

**Problem:** When the user types a lowercase letter with no surrounding whitespace, `normalised` equals `newValue` exactly. The original code still executes `query = normalised`, forcing SwiftUI to schedule a view diff and re-render even though nothing visually changed. At high typing speed this accumulates unnecessary layout passes.

**Fix:** The `if normalised != newValue { query = normalised }` guard at CHANGE 2 skips the state write entirely when the text is already in its normalised form, so no redundant update is enqueued.

**Explanation:** SwiftUI re-evaluates `body` whenever a `@State` property is written, regardless of whether the new value equals the old one. Assigning `query = normalised` when both strings are identical still marks the view as dirty and schedules a re-render. For a `TextField` that fires `onChange` on every inserted character, this means extra layout work on every keypress even for users who only type lowercase without spaces. Skipping the write when `normalised == newValue` avoids that overhead. This also makes the intent explicit in code: the assignment only happens when there is a real correction to make, which makes the logic easier to audit later.
