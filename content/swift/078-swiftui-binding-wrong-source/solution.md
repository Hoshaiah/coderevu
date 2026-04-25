## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Binding to Local Copy, Not State
// ------------------------------------------------------------------------

struct UserSettings {
    var displayName: String
    var notificationsEnabled: Bool
}

struct SettingsView: View {
    let settings: UserSettings

    // CHANGE 1: `draft` is now a `@State` property on the view, not a local variable inside `body`. `@State` allocates stable storage outside the view struct so the value survives re-renders and mutations trigger a new render cycle.
    // CHANGE 2: Initialise `@State` from `settings` so the draft starts with the current values passed in by the parent.
    @State private var draft: UserSettings

    init(settings: UserSettings) {
        self.settings = settings
        // CHANGE 2: Use `_draft` (the State's backing storage) to set the initial value from the `settings` argument, because @State properties cannot be assigned through `self` in an init before `super.init`.
        _draft = State(initialValue: settings)
    }

    var body: some View {
        Form {
            Section("Profile") {
                TextField("Display Name", text: $draft.displayName)
            }
            Section {
                Toggle("Notifications", isOn: $draft.notificationsEnabled)
            }
            Button("Save") {
                // save draft
                print("Saving: \(draft.displayName)")
            }
        }
    }
}
```

## Explanation

### Issue 1: Local Variable Discarded on Every Render

**Problem:** Every time SwiftUI calls `body` to re-render the view — which happens whenever the user types a character — the line `var draft = settings` runs again and resets `draft` back to the original value. The user sees their input vanish immediately after each keystroke.

**Fix:** Remove `var draft = settings` from inside `body` and replace it with a `@State private var draft: UserSettings` property on the view struct, initialised once via `_draft = State(initialValue: settings)` in `init`.

**Explanation:** SwiftUI calls `body` as a pure function of the view's state; local variables inside it are scratch space that is thrown away after each call. `@State` tells SwiftUI to allocate heap storage for the value that is owned by the framework, not by the ephemeral view struct value. When `$draft.displayName` is mutated by the `TextField`, SwiftUI writes to that stable storage and then re-renders — but the stored value is read back from the `@State` backing store, not re-created from `settings`. A related pitfall: if you later pass a new `settings` value from the parent, `@State` will not automatically re-sync because `@State` only reads its `initialValue` once. If live sync is needed, `@Binding` or an `onChange` modifier would be the next step.

---

### Issue 2: `@State` Cannot Be Initialised from a Stored Property Without a Custom `init`

**Problem:** When a `@State` property needs to be seeded from a constructor argument (like `settings`), a plain property initialiser such as `@State private var draft = settings` does not compile because `settings` is not available at the point where property default values are evaluated.

**Fix:** Add an explicit `init(settings:)` that assigns `self.settings = settings` and then uses `_draft = State(initialValue: settings)` to initialise the `@State` wrapper's backing storage directly.

**Explanation:** Swift evaluates property default-value expressions before `self` is fully initialised, so you cannot reference another stored property (`settings`) in a default value. The underscore-prefixed `_draft` is the actual `State<UserSettings>` wrapper that SwiftUI synthesises; assigning to it with `State(initialValue:)` is the idiomatic way to forward a constructor argument into `@State`. This pattern is common whenever a view is constructed with an initial value supplied by its parent but needs to own and mutate a local copy independently going forward.
