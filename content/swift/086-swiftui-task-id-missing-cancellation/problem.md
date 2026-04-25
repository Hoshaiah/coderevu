---
slug: swiftui-task-id-missing-cancellation
track: swift
orderIndex: 86
title: Task Modifier Missing ID Reruns Stale Work
difficulty: medium
tags:
  - swiftui
  - concurrency
  - task
  - correctness
language: swift
---

## Context

`Views/ArticleDetailView.swift` loads the full text of an article using a `.task` modifier when the view appears. The view is embedded in a `NavigationStack` and the user can navigate between articles rapidly using swipe gestures. Each `ArticleDetailView` receives a different `articleId`.

Users reported that when they swipe between articles quickly, the body text of an earlier article occasionally flashes on screen before the correct article's content appears — or the content never updates at all and an old article's text stays on screen. This is not a caching bug — disabling the cache reproduces it.

The developer checked that the `@State` variable `content` is reset to `nil` in `onAppear` and confirmed that `ArticleService.fetch` is hitting the network correctly for each `articleId`. The issue appears to be a race between the old and new fetch tasks.

## Buggy code

```swift
struct ArticleDetailView: View {
    let articleId: String
    @State private var content: String?
    @State private var isLoading = false
    private let service: ArticleService

    init(articleId: String, service: ArticleService) {
        self.articleId = articleId
        self.service = service
    }

    var body: some View {
        Group {
            if let content = content {
                ScrollView {
                    Text(content).padding()
                }
            } else if isLoading {
                ProgressView()
            }
        }
        .task {
            isLoading = true
            content = nil
            do {
                content = try await service.fetch(articleId: articleId)
            } catch {
                content = nil
            }
            isLoading = false
        }
    }
}
```
