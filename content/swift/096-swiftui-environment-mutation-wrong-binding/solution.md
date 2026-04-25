## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — EnvironmentObject Mutated via Wrong Binding
// ------------------------------------------------------------------------

class AppSettings: ObservableObject {
    @Published var notifications: NotificationPreferences
    init() { notifications = NotificationPreferences() }
}

struct NotificationPreferences {
    var emailEnabled: Bool = true
    var pushEnabled: Bool = true
    var smsEnabled: Bool = false
}

struct NotificationSettingsView: View {
    @EnvironmentObject var settings: AppSettings
    @State private var localSettings: NotificationPreferences = NotificationPreferences()

    var body: some View {
        Form {
            // CHANGE 1: bind to $localSettings instead of $settings.notifications so toggles only mutate the local copy, leaving the environment object untouched until the user explicitly saves.
            Toggle("Email", isOn: $localSettings.emailEnabled)
            // CHANGE 1: same fix for Push toggle — bind to localSettings, not the environment object.
            Toggle("Push",  isOn: $localSettings.pushEnabled)
            // CHANGE 1: same fix for SMS toggle — bind to localSettings, not the environment object.
            Toggle("SMS",   isOn: $localSettings.smsEnabled)

            // CHANGE 2: Save copies localSettings into settings.notifications; this is now meaningful because localSettings diverges from settings.notifications while the user edits.
            Button("Save") {
                settings.notifications = localSettings
            }
            Button("Discard") {
                localSettings = settings.notifications
            }
        }
        .onAppear {
            localSettings = settings.notifications
        }
    }
}
```

## Explanation

### Issue 1: Toggles Bind to Environment Object Directly

**Problem:** Every time the user flips a toggle, `settings.notifications` is mutated immediately. Tapping `Discard` resets `localSettings` from `settings.notifications`, but `settings.notifications` already holds the toggled value, so nothing reverts. From the user's perspective, `Discard` has no effect.

**Fix:** Replace `$settings.notifications.emailEnabled`, `$settings.notifications.pushEnabled`, and `$settings.notifications.smsEnabled` with `$localSettings.emailEnabled`, `$localSettings.pushEnabled`, and `$localSettings.smsEnabled` in the three `Toggle` calls.

**Explanation:** SwiftUI `Binding` writes back to its source on every user interaction, not on form submission. Because the bindings pointed at `settings.notifications`, each toggle tap called the `@Published` property's setter on `AppSettings`, triggering an `objectWillChange` emission and persisting the new value into the environment object right away. `localSettings` was never updated by the toggles, so it drifted out of sync with `settings.notifications` from the first flip. When `Discard` ran `localSettings = settings.notifications`, it was copying the already-mutated value back onto itself, achieving nothing. Binding the toggles to `localSettings` instead means all edits stay local; `settings.notifications` is only touched when `Save` explicitly copies `localSettings` across.

---

### Issue 2: Save Button Copy Becomes a No-Op

**Problem:** Because the toggles wrote directly to `settings.notifications`, `localSettings` was always equal to or behind the live environment state. Tapping `Save` ran `settings.notifications = localSettings`, which assigned an older or identical value — it appeared to work in tests only because the environment object was already updated by the toggles.

**Fix:** After the CHANGE 1 fix redirects toggles to `localSettings`, the `Save` button's existing line `settings.notifications = localSettings` becomes a correct, intentional commit. No token change is needed in the `Save` body itself, but the line is annotated with `// CHANGE 2` to mark that its semantics are now meaningful rather than coincidental.

**Explanation:** Before the fix, the data flow was: toggle fires → `settings.notifications` updated → `Save` copies `localSettings` (stale) to `settings.notifications` (already updated), effectively a write of an old snapshot over a newer one. After the fix the flow is: toggle fires → `localSettings` updated → `Save` copies `localSettings` (current) to `settings.notifications` (unchanged original), which is exactly the intended commit pattern. A related pitfall: if `NotificationPreferences` were a `class` instead of a `struct`, copying it by assignment would share the reference rather than the value, and mutations would bleed through even with the corrected bindings. Keeping it a `struct` ensures copy-on-assign semantics that make the local/remote split work correctly.
