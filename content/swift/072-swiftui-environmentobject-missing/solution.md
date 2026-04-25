## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Missing EnvironmentObject Causes Runtime Crash
// ------------------------------------------------------------------------

import SwiftUI

class AppEnvironment: ObservableObject {
    @Published var isLoggedIn: Bool = false
    @Published var username: String = ""
}

struct ProfileView: View {
    @EnvironmentObject var env: AppEnvironment

    var body: some View {
        VStack {
            Text("Hello, \(env.username)")
            Button("Logout") {
                env.isLoggedIn = false
            }
        }
    }
}

struct ProfileView_Previews: PreviewProvider {
    static var previews: some View {
        // CHANGE 1: Inject a concrete AppEnvironment instance so the preview (and any test that reuses this preview provider) does not crash looking for an ancestor environmentObject.
        ProfileView()
            .environmentObject(AppEnvironment())
    }
}
```

## Explanation

### Issue 1: Preview missing EnvironmentObject injection

**Problem:** The Xcode preview and any UI/screenshot test that renders `ProfileView` in isolation crashes immediately with `Fatal error: No ObservableObject of type AppEnvironment found`. The development scheme never hits this path because `App.swift` always injects the object before `ContentView` (and therefore `ProfileView`) is shown, but the preview and test entry points construct `ProfileView` directly with no ancestor that calls `.environmentObject()`.

**Fix:** At the `CHANGE 1` site, chain `.environmentObject(AppEnvironment())` onto the `ProfileView()` call inside `ProfileView_Previews.previews`. This supplies a live `AppEnvironment` instance to every view in the preview hierarchy.

**Explanation:** SwiftUI's `@EnvironmentObject` property wrapper does not hold a default value. When SwiftUI resolves the wrapper it walks up the view hierarchy looking for an object registered under the matching type key. If nothing is found it triggers a `fatalError` at runtime, not at compile time — so the bug is invisible until the view is actually rendered. The production `App.swift` injects the object high in the tree so normal runs are fine. CI screenshot tests and preview renders start from a synthetic root that has no such injection, so the walk finds nothing and crashes. Adding `.environmentObject(AppEnvironment())` in the `PreviewProvider` makes the preview self-contained. The same pattern should be applied in any `XCTestCase` that constructs `ProfileView` directly: wrap it in a `UIHostingController` and inject a configured `AppEnvironment` before presenting.
