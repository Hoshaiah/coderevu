---
slug: swiftui-list-item-binding-stale-index
track: swift
orderIndex: 91
title: Stale Index Binding in ForEach
difficulty: medium
tags:
  - swiftui
  - binding
  - state
  - list
language: swift
---

## Context

This code is in `TaskListView.swift`, a SwiftUI screen showing a to-do list backed by an `@State` array of `Task` structs. Each row has a `Toggle` for marking a task complete. The list supports deletion via swipe, and the state array is the single source of truth.

After a user deletes an item and then toggles a task on any remaining row, the wrong task gets marked complete — often the task that was just deleted, causing the UI to desync from the model. If the user deletes the last item in the list the app sometimes crashes with an index-out-of-bounds trap.

The team profiled the view hierarchy and confirmed `@State` updates are happening on the main thread. They ruled out issues with `Identifiable` conformance — each `Task` has a unique `UUID`. The bug was introduced when someone refactored from `ForEach(tasks)` to `ForEach(tasks.indices)` to get index-based bindings.

## Buggy code

```swift
struct Task: Identifiable {
    let id: UUID
    var title: String
    var isComplete: Bool
}

struct TaskListView: View {
    @State private var tasks: [Task] = [
        Task(id: UUID(), title: "Buy groceries", isComplete: false),
        Task(id: UUID(), title: "Call dentist", isComplete: false),
        Task(id: UUID(), title: "Ship release", isComplete: false)
    ]

    var body: some View {
        List {
            ForEach(tasks.indices, id: \.self) { index in
                Toggle(tasks[index].title, isOn: $tasks[index].isComplete)
            }
            .onDelete { offsets in
                tasks.remove(atOffsets: offsets)
            }
        }
    }
}
```
