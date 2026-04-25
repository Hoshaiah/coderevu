---
slug: mainactor-objectwillchange-background
track: swift
orderIndex: 82
title: ObservableObject Published from Background Thread
difficulty: medium
tags:
  - swiftui
  - concurrency
  - main-actor
  - observable-object
language: swift
---

## Context

`ViewModels/FeedViewModel.swift` fetches a social feed from a REST API and publishes the results. The view model uses `URLSession` with async/await and assigns the decoded results to a `@Published` property. SwiftUI's `List` is bound to this property via `@StateObject`.

Users on older devices running iOS 15 and 16 report occasional purple warnings in Xcode: 'Publishing changes from background threads is not allowed; make sure to publish values from the main thread (via operators like receive(on:)) on model updates.' Some users also see intermittent crashes with `EXC_BAD_ACCESS` during heavy scrolling when new data arrives while the list is updating.

The team adopted async/await and removed their Combine `receive(on: DispatchQueue.main)` pipeline, believing that `@MainActor` on the view model class would handle threading automatically. They are half right — the annotation helps but there is a gap.

## Buggy code

```swift
import SwiftUI
import Foundation

@MainActor
class FeedViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func loadFeed() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let url = URL(string: "https://api.example.com/feed")!
            let (data, _) = try await URLSession.shared.data(from: url)
            let decoded = try JSONDecoder().decode([Post].self, from: data)
            posts = decoded
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
```
