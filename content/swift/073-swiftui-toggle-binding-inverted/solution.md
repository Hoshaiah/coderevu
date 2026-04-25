## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Inverted Boolean Binding in Toggle
// ------------------------------------------------------------------------

import SwiftUI

class SettingsViewModel: ObservableObject {
    @Published var notificationsEnabled: Bool = true

    func save() {
        UserDefaults.standard.set(notificationsEnabled, forKey: "notificationsEnabled")
    }
}

struct NotificationSettingsView: View {
    @StateObject private var viewModel = SettingsViewModel()

    var body: some View {
        Form {
            Section("Notifications") {
                Toggle(
                    "Enable Push Notifications",
                    isOn: Binding(
                        get: { viewModel.notificationsEnabled },
                        // CHANGE 1: Removed the `!` negation so the setter assigns the new value directly instead of inverting it.
                        set: { viewModel.notificationsEnabled = $0 }
                    )
                )
            }
        }
        .navigationTitle("Settings")
        // CHANGE 2: Replaced the deprecated single-argument closure with the two-argument form that receives old and new values, silencing the deprecation warning in Swift 5.9+.
        .onChange(of: viewModel.notificationsEnabled) { _, _ in
            viewModel.save()
        }
    }
}
```

## Explanation

### Issue 1: Inverted Binding Setter Negates Value

**Problem:** Every time the user flips the toggle, the app stores the opposite of what the toggle shows. Turning notifications ON persists `false`; turning them OFF persists `true`. The initial display is correct because the `get` closure is unaffected, but every write is wrong.

**Fix:** In the `set` closure of the `Binding`, remove the `!` operator so the line reads `viewModel.notificationsEnabled = $0` instead of `viewModel.notificationsEnabled = !$0`.

**Explanation:** SwiftUI passes the *new* desired value into a `Binding`'s `set` closure as `$0`. When the user switches the toggle to ON, `$0` is `true`. Applying `!$0` turns that into `false` before it is stored in the view model. The `onChange` handler then calls `save()` immediately, persisting the inverted value to `UserDefaults`. Because `get` correctly reads `viewModel.notificationsEnabled`, the toggle re-renders showing the stored (wrong) value on the next layout pass, which makes the UI appear to track user intent — but the persisted value is always backwards. A related pitfall: wrapping the binding in a negation *intentionally* is a valid pattern for an "opt-out" toggle (e.g., `muteNotifications`), so reviewers should verify whether the inversion is deliberate before removing it.

---

### Issue 2: Deprecated Single-Argument `onChange` Closure

**Problem:** The `onChange(of:perform:)` overload that receives a single argument (the new value) was deprecated in iOS 17 / Swift 5.9. Projects targeting those SDKs will see a compiler warning, and the overload may be removed in a future release, breaking the build.

**Fix:** Replace `.onChange(of: viewModel.notificationsEnabled) { _ in` with `.onChange(of: viewModel.notificationsEnabled) { _, _ in }`, using the two-argument closure form that receives `(oldValue, newValue)` as introduced in Swift 5.9.

**Explanation:** Apple split `onChange` into two new signatures: a zero-argument closure `{ }` and a two-argument closure `{ oldValue, newValue in }`. Both are non-deprecated. The single-argument form `{ newValue in }` was kept for source compatibility but marked deprecated. Since this handler only needs to trigger a save (it does not use the value itself), either the zero-argument `{ }` or the two-argument `{ _, _ in }` form works. Using `{ _, _ in }` is the safest mechanical replacement because it matches the structure of the old code most closely and makes the intent explicit to future readers.
