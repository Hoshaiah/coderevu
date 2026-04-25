---
slug: swiftui-observed-published-main-thread
track: swift
orderIndex: 90
title: ObservableObject Published Off Main Thread
difficulty: medium
tags:
  - swiftui
  - concurrency
  - main-actor
  - observable
language: swift
---

## Context

This code is in `FeedViewModel.swift` and its associated SwiftUI view `FeedView.swift`. The view model fetches a list of articles from a REST API and publishes them to a SwiftUI view via `@Published`. The fetch is triggered by a button tap. The app targets iOS 15.

Users intermittently see the app hang for a few seconds and occasionally crash with a `UITableView` or rendering-related stack trace on the main thread. The bug is more frequent on slower network connections where the response arrives quickly after a context switch. Console sometimes prints "UIView/CALayer is not thread-safe".

The team suspects the network layer but it has been tested standalone without issues. The ViewModel was recently changed to use `async/await` after previously using a completion-handler pattern that explicitly dispatched to `DispatchQueue.main`.

## Buggy code

```swift
import SwiftUI
import Combine

class FeedViewModel: ObservableObject {
    @Published var articles: [String] = []
    @Published var isLoading: Bool = false

    func fetchArticles() {
        Task {
            isLoading = true
            do {
                let fetched = try await loadFromNetwork()
                articles = fetched
            } catch {
                print("Fetch error: \(error)")
            }
            isLoading = false
        }
    }

    private func loadFromNetwork() async throws -> [String] {
        try await Task.sleep(nanoseconds: 500_000_000)
        return ["Article 1", "Article 2", "Article 3"]
    }
}

struct FeedView: View {
    @ObservedObject var viewModel = FeedViewModel()

    var body: some View {
        List(viewModel.articles, id: \.self) { article in
            Text(article)
        }
        .onAppear { viewModel.fetchArticles() }
    }
}
```
