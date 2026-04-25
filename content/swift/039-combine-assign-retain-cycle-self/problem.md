---
slug: combine-assign-retain-cycle-self
track: swift
orderIndex: 39
title: 'Combine assign(to:on:) Retain Cycle'
difficulty: medium
tags:
  - memory
  - combine
  - retain-cycle
language: swift
---

## Context

`SearchViewModel.swift` powers a search screen. It uses Combine to debounce user input and update a `@Published` results array. The view model is owned by the view controller, which is pushed onto a navigation stack. The pattern follows Apple's recommended `assign(to:on:)` usage as shown in several blog posts.

Instruments' Leaks template shows that `SearchViewModel` is never deallocated after the user pops the search screen. Memory climbs steadily as the user navigates in and out of search. The view controller itself appears to release, but the view model does not. No crash — just a slow memory leak that becomes noticeable after 20–30 navigation cycles.

The team already audited the view controller and confirmed it doesn't hold an extra reference. The leak is entirely within the Combine pipeline inside the view model.

## Buggy code

```swift
import Combine
import Foundation

final class SearchViewModel {
    @Published var query: String = ""
    @Published var results: [String] = []

    private var cancellables = Set<AnyCancellable>()

    init() {
        $query
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .removeDuplicates()
            .flatMap { [weak self] text -> AnyPublisher<[String], Never> in
                guard let self else {
                    return Just([]).eraseToAnyPublisher()
                }
                return self.search(text: text)
            }
            .assign(to: \.results, on: self)  // <-- convenient one-liner
            .store(in: &cancellables)
    }

    private func search(text: String) -> AnyPublisher<[String], Never> {
        // Simulated async search
        Just(text.isEmpty ? [] : ["Result for \(text)"])
            .eraseToAnyPublisher()
    }
}
```
