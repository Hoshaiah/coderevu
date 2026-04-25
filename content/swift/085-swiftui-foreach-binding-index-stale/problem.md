---
slug: swiftui-foreach-binding-index-stale
track: swift
orderIndex: 85
title: ForEach Index Binding Stale After Delete
difficulty: medium
tags:
  - swiftui
  - binding
  - state
  - foreach
language: swift
---

## Context

`Views/TaskListView.swift` displays a list of user tasks stored in a `@State` array. Each row uses a `Toggle` bound to the `isCompleted` property of the corresponding task. Users can also swipe to delete rows. The view is standalone with no external data source — all state lives locally in the view struct.

Users reported that after deleting a task, tapping a toggle on any remaining row either changes the wrong task's completion state or causes an index-out-of-range crash. The crash trace points into the `ForEach` body. Deleting from the end of the list is safe, but deleting from the middle or the beginning reliably triggers the wrong-row mutation.

Switching from swipe-to-delete to a dedicated Edit mode was tried and exhibited the same behavior, ruling out the gesture recognizer as the culprit.

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
        Task(id: UUID(), title: "Write tests", isCompleted: false)
    ]

    var body: some View {
        List {
            ForEach(tasks.indices, id: \.self) { index in
                Toggle(tasks[index].title, isOn: $tasks[index].isCompleted)
            }
            .onDelete { indexSet in
                tasks.remove(atOffsets: indexSet)
            }
        }
    }
}
```
