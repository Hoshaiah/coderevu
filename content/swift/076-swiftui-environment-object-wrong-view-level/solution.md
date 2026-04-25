## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — EnvironmentObject Injected at Wrong Level
// ------------------------------------------------------------------------

import SwiftUI

class UserSettings: ObservableObject {
    @Published var darkMode: Bool = false
    @Published var notificationsEnabled: Bool = true
}

struct ContentView: View {
    @StateObject private var settings = UserSettings()

    var body: some View {
        // CHANGE 1: Move .environmentObject(settings) onto TabView so all tab children inherit it, not just SettingsView's tab item.
        TabView {
            HomeTab()
                .tabItem { Label("Home", systemImage: "house") }

            SettingsView()
                // CHANGE 2: Removed .environmentObject(settings) from here; injection is now handled at the TabView level above.
                .tabItem { Label("Settings", systemImage: "gear") }
        }
        .environmentObject(settings) // CHANGE 1: Injected here so every tab, including HomeTab, can access UserSettings.
    }
}

struct HomeTab: View {
    var body: some View {
        Text("Home")
    }
}

struct SettingsView: View {
    @EnvironmentObject var settings: UserSettings

    var body: some View {
        Toggle("Dark Mode", isOn: $settings.darkMode)
    }
}
```

## Explanation

### Issue 1: environmentObject injected at wrong view level

**Problem:** The app crashes with `"No ObservableObject of type UserSettings found"` the moment the user switches to the Settings tab. SwiftUI cannot find `UserSettings` in the environment because the injection is attached to the `SettingsView()` call inside `tabItem`-adjacent content rather than to the container that owns all tabs.

**Fix:** Remove `.environmentObject(settings)` from the `SettingsView()` line and attach it to the `TabView` instead, as `.environmentObject(settings)` on the closing side of the `TabView { ... }` block. This is shown at the `// CHANGE 1` site.

**Explanation:** SwiftUI's environment flows downward through the view hierarchy. When you write `SettingsView().environmentObject(settings)`, you're wrapping only that one expression; SwiftUI may still lazily instantiate or re-parent tab content in a way that loses the wrapper. More importantly, `.tabItem` modifier closures are not standard child views — they describe tab bar labels, not the content hierarchy. Attaching the environment object to the `TabView` itself makes it an ancestor of every tab's content view, so the environment key is present no matter which tab is active or how SwiftUI rebuilds the tree. A related pitfall: if you later present a sheet from inside a tab, sheets also need the environment object on their root view or inherited from a high-enough ancestor.

---

### Issue 2: HomeTab excluded from UserSettings environment

**Problem:** `HomeTab` and any of its descendants that declare `@EnvironmentObject var settings: UserSettings` would crash the same way, because the original code only injected `settings` on the `SettingsView()` expression and `HomeTab()` received nothing.

**Fix:** By moving `.environmentObject(settings)` to the `TabView` level (the `// CHANGE 1` site), `HomeTab` automatically inherits the same environment object without any additional code at the `// CHANGE 2` site.

**Explanation:** Each tab's root view is a direct child of `TabView`. If the environment object sits on a sibling view (`SettingsView`) rather than on their shared parent (`TabView`), other siblings like `HomeTab` are completely unaware of it. SwiftUI does not share environment values sideways between siblings — only top-down from parent to child. Placing the injection on `TabView` fixes all current and future tabs in one step, so adding a new tab later doesn't require remembering to repeat the injection.
