---
slug: swiftui-list-state-binding-wrong-item
track: swift
orderIndex: 89
title: SwiftUI List Binding Captures Wrong Index
difficulty: medium
tags:
  - swiftui
  - binding
  - state
  - list
language: swift
---

## Context

This code is in `TaskListView.swift`, a SwiftUI to-do list screen. Each row contains a `Toggle` bound to the task's `isCompleted` property. The list is backed by a `@State` array of `Task` structs. The view compiles and runs without warnings.

Users report that toggling a checkbox in the middle of the list frequently marks the wrong task as complete. Sometimes toggling one item visually toggles a completely different row. The bug is especially obvious after the list has been filtered or reordered.

The team verified that the `Task` model struct and data source are correct. They also confirmed that the `id` field is unique per task. The issue was introduced when a junior developer rewrote the list using `ForEach` with an index range instead of iterating over the collection directly.

## Buggy code

```swift
struct Task: Identifiable {
    let id: UUID
    var title: String
    var isCompleted: Bool
}

struct TaskListView: View {
    @State private var tasks: [Task] = [
        Task(id: UUID(), title: "Buy groceries", isCompleted: false),
        Task(id: UUID(), title: "Walk the dog", isCompleted: false),
        Task(id: UUID(), title: "Read a book", isCompleted: true)
    ]

    var body: some View {
        List {
            ForEach(0..<tasks.count, id: \.self) { index in
                Toggle(tasks[index].title,
                       isOn: $tasks[index].isCompleted)
            }
        }
    }
}
```
