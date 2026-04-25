## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Picker Tag Type Mismatch Never Selects
// ------------------------------------------------------------------------

import SwiftUI

struct SettingsView: View {
    @AppStorage("notificationInterval") var interval: Int = 15

    let options: [Int] = [5, 10, 15, 30]

    var body: some View {
        Form {
            Section("Notifications") {
                Picker("Interval (minutes)", selection: $interval) {
                    ForEach(options, id: \.self) { option in
                        // CHANGE 1: Use `.tag(option)` with the concrete `Int` type instead of `.tag(option as Any)` so the tag type matches the `Int` binding and SwiftUI can find the selected row.
                        Text("\(option) minutes").tag(option)
                    }
                }
            }
        }
    }
}
```

## Explanation

### Issue 1: Tag Type Erased to `Any`

**Problem:** The picker never shows a checkmark next to any row, even after tapping and confirming the stored value changed. Every row appears unselected regardless of the current `interval` value.

**Fix:** Replace `.tag(option as Any)` with `.tag(option)` at the `Text` call inside `ForEach`. This lets Swift infer the tag type as `Int`, matching the `$interval` binding type exactly.

**Explanation:** SwiftUI's `Picker` finds the selected row by comparing each row's tag value — set via `.tag(_:)` — to the current binding value using `==`. For this comparison to succeed, both sides must be the same concrete type. When you write `option as Any`, you erase the `Int` to `Any`. The binding is still typed as `Int`, so SwiftUI compares an `Int` to an `Any`-typed value and they never match, even when the underlying integer is identical. The compiler accepts the cast without complaint because `Any` is always a valid upcast. The fix removes the cast so the tag carries its native `Int` type, which matches `$interval` directly and lets SwiftUI highlight the correct row. A related pitfall: the same silent failure occurs with `as AnyHashable` — it looks safe but breaks picker selection for the same reason.

---

### Issue 2: Silent `Any` Upcast Compiles Without Warning

**Problem:** The bug produces no compiler warning or runtime error. The view renders and the stored value updates correctly, so the only symptom is the missing visual selection, which is easy to attribute to other causes.

**Fix:** Removing `as Any` at the `CHANGE 1` site eliminates the erasing cast entirely. With the concrete type preserved, there is nothing ambiguous for the compiler to warn about and nothing for SwiftUI to silently miscompare at runtime.

**Explanation:** Swift allows upcasting any value to `Any` at any call site without restriction, and the `Hashable`-constrained `.tag(_:)` generic resolves to `Any` when passed an `Any`-typed argument. This is type-safe from the language's perspective — no information is lost in a way the compiler tracks — but SwiftUI's internal equality check operates on the concrete boxed type at runtime. Two `Any` boxes wrapping the same `Int` are not guaranteed to compare equal through SwiftUI's tag-matching path when one side enters as `Int` and the other as `Any`. Because no diagnostic fires, developers must know to avoid upcasts in `.tag()` arguments. Keeping the argument at its natural inferred type (`Int` here) is the safest habit across all `Picker` usages.
