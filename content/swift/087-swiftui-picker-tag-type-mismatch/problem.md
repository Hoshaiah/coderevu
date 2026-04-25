---
slug: swiftui-picker-tag-type-mismatch
track: swift
orderIndex: 87
title: Picker Tag Type Mismatch Never Selects
difficulty: medium
tags:
  - swiftui
  - optionals
  - picker
  - correctness
language: swift
---

## Context

This code is in `SettingsView.swift` of a productivity app. A `Picker` lets users choose their preferred notification interval from a list of integers (5, 10, 15, 30 minutes). The selection is stored in `AppStorage` as an `Int`. The view compiles and renders without warnings.

Users report that the picker never shows any item as selected — the checkmark is always absent regardless of which row they tap. Tapping a row appears to update the stored value (the number is correct when read elsewhere), but the visual selection never reflects the current value.

The team verified the `AppStorage` key is correct and confirmed the value changes. They ruled out SwiftUI view identity issues and confirmed `SettingsView` is being re-rendered when the value changes.

## Buggy code

```swift
import SwiftUI

struct SettingsView: View {
    @AppStorage("notificationInterval") var interval: Int = 15

    let options: [Int] = [5, 10, 15, 30]

    var body: some View {
        Form {
            Section("Notifications") {
                Picker("Interval (minutes)", selection: $interval) {
                    ForEach(options, id: \.self) { option in
                        Text("\(option) minutes").tag(option as Any)
                    }
                }
            }
        }
    }
}
```
