---
slug: swiftui-list-foreach-index-mutation
track: swift
orderIndex: 84
title: ForEach Index Mutation Crash
difficulty: medium
tags:
  - swiftui
  - state
  - crash
language: swift
---

## Context

`TaskListView.swift` is a SwiftUI view that renders a to-do list backed by an `@State` array. Users can delete items by swiping. The view was written quickly during a hackathon and uses integer indices to identify rows, which is the first approach many developers reach for.

Users report that deleting the last item in a list sometimes crashes the app with `Fatal error: Index out of range`. The crash is not 100% reproducible — it happens more often when the list has exactly one item, but occasionally with larger lists too. Deleting from the middle of a longer list seems fine.

The team added a bounds check before the delete and thought the bug was fixed, but the crash reappeared in the next TestFlight build. The root cause is in how SwiftUI drives the `onDelete` callback relative to its own internal diffing.

## Buggy code

```swift
struct Task: Identifiable {
    let id: UUID
    var title: String
}

struct TaskListView: View {
    @State private var tasks: [Task] = [
        Task(id: UUID(), title: "Buy groceries"),
        Task(id: UUID(), title: "Walk the dog"),
        Task(id: UUID(), title: "Write unit tests"),
    ]

    var body: some View {
        List {
            ForEach(tasks.indices, id: \.self) { index in
                Text(tasks[index].title)
            }
            .onDelete { indexSet in
                tasks.remove(atOffsets: indexSet)
            }
        }
    }
}
```
