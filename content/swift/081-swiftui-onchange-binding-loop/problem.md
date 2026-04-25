---
slug: swiftui-onchange-binding-loop
track: swift
orderIndex: 81
title: SwiftUI onChange Triggers Infinite Loop
difficulty: medium
tags:
  - swiftui
  - state
  - binding
  - onChange
language: swift
---

## Context

`Views/SearchView.swift` is a SwiftUI search screen. A `@State` string drives a `TextField`, and an `.onChange` modifier is used to normalise the input (trim whitespace, lowercase) before passing it to the view model. The view model is an `ObservableObject` that publishes `results` which drives a `List`.

On iOS 16+ devices, the app hangs for several seconds when the user types in the search field. The Xcode frame rate monitor drops to 0 fps and the CPU pegs at 100% on the main thread. Eventually the UI recovers but the text field shows duplicate or garbled characters. The bug is consistent and reproducible by typing any single character.

The team confirmed the view model's `search(query:)` method is not the source of the loop — commenting it out doesn't help. They also verified the TextField binding itself isn't the problem by testing with a plain binding to a `@State` string without the onChange modifier.

## Buggy code

```swift
import SwiftUI

struct SearchView: View {
    @StateObject private var viewModel = SearchViewModel()
    @State private var query: String = ""

    var body: some View {
        NavigationStack {
            VStack {
                TextField("Search...", text: $query)
                    .textFieldStyle(.roundedBorder)
                    .padding()
                    .onChange(of: query) { newValue in
                        let normalised = newValue
                            .trimmingCharacters(in: .whitespaces)
                            .lowercased()
                        query = normalised
                        viewModel.search(query: normalised)
                    }

                List(viewModel.results, id: \.id) { result in
                    Text(result.title)
                }
            }
            .navigationTitle("Search")
        }
    }
}
```
