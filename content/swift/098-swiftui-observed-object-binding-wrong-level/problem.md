---
slug: swiftui-observed-object-binding-wrong-level
track: swift
orderIndex: 98
title: ObservedObject Binding Wrong Level
difficulty: hard
tags:
  - swiftui
  - state
  - binding
language: swift
---

## Context

`SettingsView.swift` is a multi-section settings screen in a productivity app. Each section is extracted into its own child view for readability. A `SettingsViewModel` is an `ObservableObject` owned at the root level. A child view, `NotificationSettingsView`, renders a `Toggle` that should flip `viewModel.notificationsEnabled`.

When the user taps the toggle, it visually flips for a fraction of a second and then snaps back to its previous state. The setting is not persisted. Adding a `print` statement inside the `Toggle`'s action confirms it fires, but the view model's property does not change. There is no compile error and no runtime warning.

The team verified the `ObservableObject` conformance is correct and `@Published` is on the right property. They also confirmed that `objectWillChange` fires. The problem is in how the binding is threaded from the parent to the child.

## Buggy code

```swift
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
            NotificationSettingsView(isEnabled: viewModel.notificationsEnabled)
        }
    }
}

struct NotificationSettingsView: View {
    // Passed by value — changes here do not propagate back
    var isEnabled: Bool

    var body: some View {
        Toggle("Enable Notifications", isOn: .constant(isEnabled))
    }
}
```
