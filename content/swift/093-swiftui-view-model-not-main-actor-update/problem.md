---
slug: swiftui-view-model-not-main-actor-update
track: swift
orderIndex: 93
title: Published Update Off Main Thread
difficulty: medium
tags:
  - swiftui
  - concurrency
  - main-actor
  - published
language: swift
---

## Context

This code is in `FeedViewModel.swift` and `FeedView.swift`. The view model fetches a list of articles from a REST API on a background thread using a plain `Task` and updates a `@Published` property with the results. `FeedView` observes the view model and renders a list of articles.

The app receives occasional `[SwiftUI] Publishing changes from background threads is not allowed` runtime warnings in the Xcode console. On older devices running iOS 14, this escalates to a full UI glitch where the list renders partially or flickers. On some beta builds the app has crashed with `UITableView` consistency exceptions originating from SwiftUI's UIKit backing layer.

The team added `DispatchQueue.main.async` around a different property update elsewhere and assumed the same pattern was applied everywhere. They did not notice that the articles update also happens off-thread.

## Buggy code

```swift
import SwiftUI
import Combine

class FeedViewModel: ObservableObject {
    @Published var articles: [Article] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String? = nil

    func fetchArticles() {
        isLoading = true
        Task {
            do {
                let fetched = try await ArticleService.shared.getLatest()
                articles = fetched
                isLoading = false
            } catch {
                errorMessage = error.localizedDescription
                isLoading = false
            }
        }
    }
}

struct FeedView: View {
    @StateObject private var viewModel = FeedViewModel()

    var body: some View {
        List(viewModel.articles, id: \.id) { article in
            Text(article.title)
        }
        .onAppear {
            viewModel.fetchArticles()
        }
    }
}
```
