---
slug: swiftui-task-modifier-stale-closure
track: swift
orderIndex: 97
title: task Modifier Captures Stale Value
difficulty: hard
tags:
  - swiftui
  - concurrency
  - async-await
language: swift
---

## Context

`ArticleDetailView.swift` displays a news article. When the user taps a different article in a master list, SwiftUI updates the detail view in-place by changing the `articleID` binding rather than recreating the view. The `.task(id:)` modifier was chosen specifically for its cancellation-and-restart semantics when the id changes.

Readers complain that after quickly tapping through several articles, the detail view sometimes shows the wrong content — an article title from two or three selections ago. The issue is more pronounced on slower devices and completely invisible in Xcode Previews. Network traces show multiple fetch requests completing out of order.

The team confirmed `.task(id: articleID)` is used (not plain `.task`), which should cancel the previous task when `articleID` changes. They are puzzled because the cancellation appears to work — old tasks are cancelled — yet wrong content still appears.

## Buggy code

```swift
struct ArticleDetailView: View {
    let articleID: String
    @State private var article: Article?
    @State private var isLoading = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let article {
                ArticleBodyView(article: article)
            }
        }
        .task(id: articleID) {
            isLoading = true
            // Capture articleID by value at task start
            let id = articleID
            do {
                let fetched = try await ArticleService.shared.fetch(id: id)
                // Check cancellation before updating state
                try Task.checkCancellation()
                article = fetched
                isLoading = false
            } catch {
                isLoading = false
            }
        }
    }
}
```
