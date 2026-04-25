---
slug: task-capture-self-dealloc-crash
track: swift
orderIndex: 29
title: Unowned Self Crashes After Dealloc
difficulty: easy
tags:
  - memory
  - arc
  - concurrency
  - crash
language: swift
---

## Context

This view controller lives in `SearchViewController.swift` and manages a search bar backed by a remote API. When the user types, a new `Task` is spun up to debounce and fetch results. The view controller can be dismissed while a search is in-flight — for example, the user taps a result in a sibling tab before the current fetch finishes.

Crash reports in Firebase Crashlytics show EXC_BAD_ACCESS traces pointing into the `Task` closure, specifically at the line that appends results to `self.results`. The crash only appears on devices with slower network connections where the task outlives the view controller's deallocation.

The developer added `[unowned self]` to avoid a retain cycle, having previously seen warnings about strong captures in Task closures, but the crashes started appearing shortly after that change shipped.

## Buggy code

```swift
class SearchViewController: UIViewController {
    var results: [SearchResult] = []
    var currentTask: Task<Void, Never>?

    func performSearch(query: String) {
        currentTask?.cancel()
        currentTask = Task { [unowned self] in
            guard !Task.isCancelled else { return }
            do {
                let fetched = try await SearchService.shared.fetch(query: query)
                self.results = fetched
                self.reloadTable()
            } catch {
                // ignore cancellation errors
            }
        }
    }

    func reloadTable() {
        tableView.reloadData()
    }
}
```
