---
slug: swiftui-environment-mutation-wrong-binding
track: swift
orderIndex: 96
title: EnvironmentObject Mutated via Wrong Binding
difficulty: hard
tags:
  - swiftui
  - state-management
  - environment
  - binding
language: swift
---

## Context

This SwiftUI settings screen lives in `NotificationSettingsView.swift` in a productivity app. User preferences are stored in `AppSettings`, an `ObservableObject` injected via `.environmentObject`. The view lets users toggle individual notification categories. A local copy of the settings is made so the user can discard changes; `Save` commits the copy back to the environment object.

Testers found that toggling any category switch and tapping `Save` correctly persists the change. However, toggling a switch and then tapping `Discard` (which should revert to the original) still persists the change. Effectively `Discard` behaves identically to `Save`.

The developer is confident the discard logic is correct because `localSettings` is reset to `settings.notifications` on appear. Breakpoints confirm `localSettings` is reset, but the environment object has already been mutated by the time `Discard` is tapped.

## Buggy code

```swift
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
            // BUG: binding directly into settings.notifications instead of localSettings
            Toggle("Email", isOn: $settings.notifications.emailEnabled)
            Toggle("Push",  isOn: $settings.notifications.pushEnabled)
            Toggle("SMS",   isOn: $settings.notifications.smsEnabled)

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
