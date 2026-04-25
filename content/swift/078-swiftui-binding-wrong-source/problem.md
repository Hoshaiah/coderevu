---
slug: swiftui-binding-wrong-source
track: swift
orderIndex: 78
title: 'Binding to Local Copy, Not State'
difficulty: medium
tags:
  - swiftui
  - binding
  - state
  - correctness
language: swift
---

## Context

This is a SwiftUI form in `SettingsView.swift` that lets users edit their display name. It is part of an iOS settings screen. The `UserSettings` model is passed in as a value type from the parent view. The developer wanted to allow in-place editing without immediately committing changes, so they copied the settings into a local variable.

Users report that typing in the text field has no effect — the field appears to accept input but immediately reverts each character. The bug is 100% reproducible. No network calls are involved; it is purely local state.

The developer confirmed that `UserSettings` is a `struct`. They tried adding `mutating` to various functions but the text field still would not update.

## Buggy code

```swift
struct UserSettings {
    var displayName: String
    var notificationsEnabled: Bool
}

struct SettingsView: View {
    let settings: UserSettings

    var body: some View {
        // Local mutable copy for editing
        var draft = settings

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
