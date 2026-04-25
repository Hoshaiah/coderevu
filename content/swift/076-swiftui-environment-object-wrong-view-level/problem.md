---
slug: swiftui-environment-object-wrong-view-level
track: swift
orderIndex: 76
title: EnvironmentObject Injected at Wrong Level
difficulty: easy
tags:
  - swiftui
  - environment
  - state-management
  - crash
language: swift
---

## Context

This code is in `AppRoot.swift` and `SettingsView.swift`. The app uses an `EnvironmentObject` to share a `UserSettings` observable across multiple screens. `SettingsView` is presented modally from a `TabView`. The developer injected the environment object on the tab content rather than on the root view.

The app crashes immediately when the user taps to open the Settings tab with the error: `"No ObservableObject of type UserSettings found. A View.environmentObject(_:) for UserSettings may be missing as an ancestor of this view."`

The team spent time checking that `UserSettings` conforms to `ObservableObject` and that the `@EnvironmentObject` property wrapper is used correctly inside `SettingsView`. Everything looks right to them at the point of use.

## Buggy code

```swift
import SwiftUI

class UserSettings: ObservableObject {
    @Published var darkMode: Bool = false
    @Published var notificationsEnabled: Bool = true
}

struct ContentView: View {
    @StateObject private var settings = UserSettings()

    var body: some View {
        TabView {
            HomeTab()
                .tabItem { Label("Home", systemImage: "house") }

            SettingsView()
                .environmentObject(settings)
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var settings: UserSettings

    var body: some View {
        Toggle("Dark Mode", isOn: $settings.darkMode)
    }
}
```
