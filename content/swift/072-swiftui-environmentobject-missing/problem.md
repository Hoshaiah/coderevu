---
slug: swiftui-environmentobject-missing
track: swift
orderIndex: 72
title: Missing EnvironmentObject Causes Runtime Crash
difficulty: easy
tags:
  - swiftui
  - environment
  - crash
  - dependency-injection
language: swift
---

## Context

This is an iOS app built with SwiftUI. `AppEnvironment` is an `ObservableObject` that holds app-wide state (authentication, theming). It is injected at the root `ContentView` using `.environmentObject()`. `ProfileView` is reachable from a deep navigation path and reads the environment object.

The app crashes immediately on launch during screenshot tests and UI tests on the CI pipeline. The crash message is `Fatal error: No ObservableObject of type AppEnvironment found. A View.environmentObject(_:) for AppEnvironment may be missing as an ancestor of this view.` The crash does not occur in the development scheme.

The developer confirmed that `ContentView` has the environment object injected in `App.swift`. The test host uses a separate preview/test entry point that constructs views in isolation.

## Buggy code

```swift
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
        ProfileView()
    }
}
```
