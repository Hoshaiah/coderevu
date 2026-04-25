## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — ObservedObject Binding Wrong Level
// ------------------------------------------------------------------------

import SwiftUI
import Combine

final class SettingsViewModel: ObservableObject {
    @Published var notificationsEnabled: Bool = true
    @Published var darkModeEnabled: Bool = false
}

struct SettingsView: View {
    @StateObject private var viewModel = SettingsViewModel()

    var body: some View {
        Form {
            // CHANGE 1: Pass a Binding<Bool> using the $ prefix so mutations in the child write back to the view model's @Published property.
            NotificationSettingsView(isEnabled: $viewModel.notificationsEnabled)
        }
    }
}

struct NotificationSettingsView: View {
    // CHANGE 1: Declare isEnabled as @Binding var instead of a plain var so the child holds a reference-like wrapper into the parent's state.
    @Binding var isEnabled: Bool

    var body: some View {
        // CHANGE 2: Pass isEnabled directly as the binding (using $isEnabled) instead of .constant(isEnabled), allowing the Toggle to write back through the binding chain.
        Toggle("Enable Notifications", isOn: $isEnabled)
    }
}
```

## Explanation

### Issue 1: Child receives value copy, not binding

**Problem:** The user taps the toggle, the toggle flips for a moment, then snaps back. The view model's `notificationsEnabled` property never changes. A `print` inside the toggle action fires, proving the gesture is detected, but the mutation has nowhere to land.

**Fix:** In `SettingsView`, change the call site from `viewModel.notificationsEnabled` to `$viewModel.notificationsEnabled`. In `NotificationSettingsView`, change `var isEnabled: Bool` to `@Binding var isEnabled: Bool`.

**Explanation:** SwiftUI's `@Published` property on an `ObservableObject` stores a value. Accessing `viewModel.notificationsEnabled` without the `$` prefix reads that value and copies it into the child view's stored property. The child owns an independent `Bool`; writing to it has no connection to the original `@Published` source. The `$` prefix on `viewModel.notificationsEnabled` instead produces a `Binding<Bool>`, which is a pair of get/set closures that reach back into the view model. Declaring the child's parameter as `@Binding var isEnabled: Bool` tells SwiftUI to accept and store that binding rather than a bare value. When the toggle sets `isEnabled`, it calls the binding's setter, which calls `viewModel.notificationsEnabled = newValue`, which triggers `objectWillChange` and causes the view hierarchy to re-render with the correct state. A related pitfall: if you later need to pass the value down another level, you must again use `$isEnabled` at the call site, not `isEnabled`.

---

### Issue 2: Toggle bound with .constant, making it read-only

**Problem:** Even if the binding were threaded correctly from the parent, `Toggle("Enable Notifications", isOn: .constant(isEnabled))` creates a binding that always returns the captured value and discards any writes. The toggle cannot persist a change regardless of what the parent passes in.

**Fix:** Replace `.constant(isEnabled)` with `$isEnabled` so the `Toggle` receives the live `@Binding` property wrapper's projected value instead of a frozen constant.

**Explanation:** `.constant(_:)` is a factory that builds a `Binding<T>` whose getter always returns the value you passed and whose setter is a no-op. It exists for previews and testing where you want a fixed value. Using it in production code silently discards every write the control attempts to make. Replacing it with `$isEnabled` hands the toggle the actual `Binding<Bool>` stored by the `@Binding` property wrapper, whose setter propagates the new value back up the chain to the view model. The symptom (toggle visually snaps back) happens because SwiftUI's render cycle immediately re-reads the unchanged source-of-truth and resets the toggle to its old position.
