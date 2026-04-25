---
slug: actor-isolated-stored-property-mainactor
track: swift
orderIndex: 56
title: Actor Property Updated Off Main Thread
difficulty: medium
tags:
  - concurrency
  - actor
  - mainactor
  - data-race
language: swift
---

## Context

This code is in `FeedLoader.swift`, a component of a SwiftUI news-reader app. `FeedLoader` is an `ObservableObject` responsible for fetching RSS items in the background and publishing results to the UI. It uses Swift concurrency and is annotated `@MainActor` so that SwiftUI can safely observe its published properties.

Users occasionally see the app crash with `EXC_BAD_ACCESS` or display garbled article counts. The crash is nondeterministic and harder to reproduce on newer devices. Enabling the Thread Sanitizer in Xcode immediately flags a data race on `articles`.

The team identified that the `loadFeed` method does background work, but believed the `@MainActor` annotation on the class would protect all property accesses automatically. They ruled out issues with the JSON decoder and URLSession configuration.

## Buggy code

```swift
import Foundation
import Combine

@MainActor
class FeedLoader: ObservableObject {
    @Published var articles: [String] = []
    @Published var isLoading: Bool = false

    func loadFeed(url: URL) {
        isLoading = true
        Task.detached {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let decoded = try JSONDecoder().decode([String].self, from: data)
                // Update published properties directly from detached task
                self.articles = decoded
                self.isLoading = false
            } catch {
                self.isLoading = false
            }
        }
    }
}
```
