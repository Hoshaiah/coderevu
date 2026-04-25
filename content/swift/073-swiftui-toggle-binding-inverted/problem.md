---
slug: swiftui-toggle-binding-inverted
track: swift
orderIndex: 73
title: Inverted Boolean Binding in Toggle
difficulty: easy
tags:
  - swiftui
  - bindings
  - state
language: swift
---

## Context

This code is in `NotificationSettingsView.swift`, a SwiftUI settings screen that lets users enable or disable push notifications. The view model lives in a separate `SettingsViewModel` and exposes a published `Bool` property. The view is embedded in a `NavigationStack` and presented from the main settings list.

Users report that the toggle appears to work backwards: when they turn notifications ON, the app behaves as if they are OFF, and vice versa. QA confirmed the issue is consistent — the persisted value is always the opposite of what the toggle shows. The view itself renders the correct initial state on first open.

A developer investigated and added a print statement confirming the binding's `wrappedValue` is being read correctly on appear, so the initial display is fine. The inversion only happens when the user interacts with the toggle.

## Buggy code

```swift
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
                        set: { viewModel.notificationsEnabled = !$0 }
                    )
                )
            }
        }
        .navigationTitle("Settings")
        .onChange(of: viewModel.notificationsEnabled) { _ in
            viewModel.save()
        }
    }
}
```
