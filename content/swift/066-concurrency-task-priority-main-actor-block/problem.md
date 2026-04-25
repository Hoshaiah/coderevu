---
slug: concurrency-task-priority-main-actor-block
track: swift
orderIndex: 66
title: "High-Priority Task Blocks Main Actor"
difficulty: hard
tags: ["concurrency", "main-actor", "performance", "async-await"]
language: swift
---

## Context

`Search/SearchViewModel.swift` is a `@MainActor`-isolated `ObservableObject` that powers a search screen. When the user types in the search field, `performSearch` is called. It kicks off a background computation — scoring and ranking a large local catalog — and then updates published properties. The ranking function is CPU-bound and takes roughly 200–400 ms on older devices.

Users on iPhone XR and older reported that the keyboard freezes and UI animations stutter visibly for several hundred milliseconds every time a character is typed. Profiling in Instruments shows the main thread pegged at 100% CPU for the duration of the search. This does not happen in the simulator.

The developer assumed `Task { }` would move work off the main thread because it is inside an `async` function, but the main thread profiler trace disagrees.

## Buggy code

```swift
@MainActor
class SearchViewModel: ObservableObject {
    @Published var results: [SearchResult] = []
    @Published var isSearching = false
    private let catalog: [CatalogItem]

    init(catalog: [CatalogItem]) {
        self.catalog = catalog
    }

    func performSearch(query: String) {
        isSearching = true
        Task {
            let ranked = rankItems(catalog, query: query)
            self.results = ranked
            self.isSearching = false
        }
    }

    private func rankItems(_ items: [CatalogItem], query: String) -> [SearchResult] {
        // Heavy CPU work: fuzzy scoring, sorting, etc.
        return items
            .compactMap { item in scoreItem(item, query: query) }
            .sorted { $0.score > $1.score }
    }

    private func scoreItem(_ item: CatalogItem, query: String) -> SearchResult? {
        // ... expensive string distance computation ...
        return SearchResult(item: item, score: 0)
    }
}
```
