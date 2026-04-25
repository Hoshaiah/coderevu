---
slug: swiftui-observed-object-shared-singleton
track: swift
orderIndex: 92
title: Shared Singleton Drops Updates
difficulty: medium
tags:
  - swiftui
  - observed-object
  - state
  - reference-semantics
language: swift
---

## Context

This code is in `SettingsView.swift` and `ProfileView.swift`, two SwiftUI views that both display and modify a `UserSession` object. `UserSession` is a singleton `ObservableObject` that holds login state and user preferences. Each view creates a local `@ObservedObject` property pointing at the singleton.

Users report that changes made in `SettingsView` (e.g., toggling dark mode) are not reflected in `ProfileView` until the user backgrounds and relaunches the app. Both views are on screen simultaneously in a `TabView`. The underlying `UserSession.settings` property does update — logging confirms it — but the UI in the other tab doesn't re-render.

The team swapped `@ObservedObject` for `@StateObject` in `SettingsView` after reading that `@StateObject` is preferred for ownership, which made no visible difference. They haven't touched `ProfileView` yet.

## Buggy code

```swift
class UserSession: ObservableObject {
    static let shared = UserSession()
    @Published var username: String = ""
    @Published var isDarkMode: Bool = false
    private init() {}
}

struct SettingsView: View {
    @StateObject private var session = UserSession.shared

    var body: some View {
        Form {
            Toggle("Dark Mode", isOn: $session.isDarkMode)
            Text("User: \(session.username)")
        }
    }
}

struct ProfileView: View {
    @StateObject private var session = UserSession.shared

    var body: some View {
        VStack {
            Text(session.isDarkMode ? "Dark" : "Light")
            Text(session.username)
        }
    }
}
```
