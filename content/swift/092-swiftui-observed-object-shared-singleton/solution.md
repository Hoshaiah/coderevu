## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Shared Singleton Drops Updates
// ------------------------------------------------------------------------

class UserSession: ObservableObject {
    static let shared = UserSession()
    @Published var username: String = ""
    @Published var isDarkMode: Bool = false
    private init() {}
}

struct SettingsView: View {
    // CHANGE 1: Replace @StateObject with @ObservedObject so SwiftUI observes the already-existing singleton rather than taking ownership of it; @StateObject is for objects this view creates and owns.
    @ObservedObject private var session = UserSession.shared

    var body: some View {
        Form {
            Toggle("Dark Mode", isOn: $session.isDarkMode)
            Text("User: \(session.username)")
        }
    }
}

struct ProfileView: View {
    // CHANGE 1: Same fix here — use @ObservedObject so this view also subscribes to the shared singleton's objectWillChange publisher and re-renders when any other view mutates it.
    @ObservedObject private var session = UserSession.shared

    var body: some View {
        VStack {
            Text(session.isDarkMode ? "Dark" : "Light")
            Text(session.username)
        }
    }
}
```

## Explanation

### Issue 1: `@StateObject` Breaks Singleton Observation

**Problem:** When `SettingsView` toggles dark mode, `ProfileView` does not re-render even though `UserSession.shared.isDarkMode` is actually updated. The other tab continues to show stale data until the app is relaunched.

**Fix:** Replace `@StateObject` with `@ObservedObject` in both `SettingsView` and `ProfileView` (the two `// CHANGE 1` sites). The property wrapper changes from `@StateObject private var session = UserSession.shared` to `@ObservedObject private var session = UserSession.shared`.

**Explanation:** `@StateObject` tells SwiftUI "this view owns the object's lifetime". When SwiftUI sees `@StateObject`, it stores the object internally per-view-instance and ignores re-evaluated initializer expressions after the first render — that is a feature, not a bug, for objects a view creates itself. But for an externally-created singleton, this means each view has its own stored reference that is disconnected from the shared publisher chain at the SwiftUI diffing level. `@ObservedObject`, by contrast, tells SwiftUI "I'm just watching this object; you don't own it". SwiftUI then subscribes directly to the passed instance's `objectWillChange` publisher and invalidates the view whenever it fires. Because both views now subscribe to the same `UserSession.shared` publisher, a mutation in `SettingsView` fires `objectWillChange` on that one object and both views are marked dirty and re-rendered in the same render pass. A related pitfall: if you ever pass a `@StateObject` down to a child view as a parameter, the child should receive it as `@ObservedObject`; using `@StateObject` in the child would silently create a second, independent instance.

---

### Issue 2: Independent Ownership Prevents Cross-View Invalidation

**Problem:** Even if the logging shows the underlying property changed, the second tab's view never invalidates because its `@StateObject` storage holds a subscription that is scoped to that view's own render cycle, not tied to mutations originating in a different view.

**Fix:** Using `@ObservedObject` in both views (the same `// CHANGE 1` sites) ensures both views subscribe to the single `objectWillChange` publisher on `UserSession.shared`. There is now one publisher and two subscribers, so any write to a `@Published` property notifies all subscribers simultaneously.

**Explanation:** `ObservableObject` works by emitting on `objectWillChange` before any `@Published` property changes. A subscriber (a SwiftUI view with `@ObservedObject`) receives that signal and queues a re-render. When two views each use `@StateObject` with the same singleton, SwiftUI's internal storage for each `@StateObject` can create separate `AnyCancellable` subscriptions that are lifecycle-bound to each view independently. A change triggered through `SettingsView`'s binding fires `objectWillChange` on the shared instance, but if `ProfileView`'s subscription is not active at exactly that moment (or was set up against a different internal copy), it misses the signal. Switching to `@ObservedObject` removes SwiftUI's ownership machinery and makes the subscription straightforward: the view directly watches the instance you hand it, and the instance is the same object in memory for both views.
