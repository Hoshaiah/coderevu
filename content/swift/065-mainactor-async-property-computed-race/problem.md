---
slug: mainactor-async-property-computed-race
track: swift
orderIndex: 65
title: Non-Isolated Computed Property Read Race
difficulty: hard
tags:
  - concurrency
  - swiftui
  - main-actor
  - data-race
language: swift
---

## Context

This view model lives in `DashboardViewModel.swift` in a news-reader app. It is annotated `@MainActor` because SwiftUI observes it from the main thread. A background task periodically refreshes articles and writes them to `articles`. A computed property `topArticles` slices the first five items and is read from the `body` of a SwiftUI view.

With strict concurrency checking enabled (`SWIFT_STRICT_CONCURRENCY = complete`), the project has zero warnings. But at runtime under TSan, a data race is occasionally reported on `articles` — specifically between the background write and the read inside `topArticles`. The team is puzzled because the entire class is `@MainActor`.

A staff engineer suspects the computed property is being called from a context that is not properly isolated despite the class-level annotation.

## Buggy code

```swift
@MainActor
class DashboardViewModel: ObservableObject {
    @Published var articles: [Article] = []

    // nonisolated is applied to avoid a warning about synchronous access
    // in a context the developer believed was purely read-only.
    nonisolated var topArticles: [Article] {
        return Array(articles.prefix(5))
    }

    func refresh() async {
        let fetched = await ArticleService.shared.fetchLatest()
        articles = fetched
    }
}
```
