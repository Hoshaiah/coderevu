---
slug: swiftui-state-init-reset
track: swift
orderIndex: 79
title: SwiftUI @State Ignores Parent Updates
difficulty: medium
tags:
  - swiftui
  - state
  - binding
  - value-semantics
language: swift
---

## Context

This code is in `FilterPanel.swift`, a SwiftUI view used inside a master-detail layout. The parent view owns the current filter string and passes it down to `FilterPanel` as a plain `String`. The panel lets users edit it locally and is expected to reflect any external reset the parent triggers (for example, when the user taps a global "Clear Filters" button).

Users report that tapping "Clear Filters" on the parent screen does not update the text field in `FilterPanel`. The field only clears if the panel is dismissed and re-shown. No crash, no error — the field just silently ignores the parent's new value.

The developer verified that the parent's state is correctly set to `""` when the button is tapped and that the parent view does re-render. The bug is isolated to the child view not reflecting the change.

## Buggy code

```swift
import SwiftUI

struct FilterPanel: View {
    @State private var localFilter: String

    init(filter: String) {
        self._localFilter = State(initialValue: filter)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Filter")
                .font(.headline)
            TextField("Search...", text: $localFilter)
                .textFieldStyle(.roundedBorder)
            Text("Current: \(localFilter)")
                .foregroundColor(.secondary)
        }
        .padding()
    }
}

struct ContentView: View {
    @State private var filter = "swift"

    var body: some View {
        VStack {
            FilterPanel(filter: filter)
            Button("Clear Filters") {
                filter = ""
            }
        }
    }
}
```
