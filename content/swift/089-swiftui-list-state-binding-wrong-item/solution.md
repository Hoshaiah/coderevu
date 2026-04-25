## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — SwiftUI List Binding Captures Wrong Index
// ------------------------------------------------------------------------

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
            // CHANGE 1: Iterate over $tasks (the binding collection) instead of an integer range so ForEach uses each Task's stable UUID as its identity, not a positional index.
            // CHANGE 2: Use the binding element `$task` directly to get a per-element Binding<Task>, then derive `$task.isCompleted`; this eliminates the stale-index problem entirely.
            ForEach($tasks) { $task in
                Toggle(task.title,
                       isOn: $task.isCompleted)
            }
        }
    }
}
```

## Explanation

### Issue 1: ForEach Uses Positional Index as Row Identity

**Problem:** Users toggle a checkbox and a different row changes state. After sorting or filtering the list, the visual row at position 2 may hold a completely different `Task` than the one SwiftUI believes is at position 2.

**Fix:** Replace `ForEach(0..<tasks.count, id: \.self)` with `ForEach($tasks)`. Because `Task` conforms to `Identifiable`, SwiftUI automatically uses each task's `id: UUID` to track rows. The `// CHANGE 1` site removes the integer range entirely.

**Explanation:** When you write `ForEach(0..<tasks.count, id: \.self)`, the `id` for each row is the integer itself — 0, 1, 2, etc. SwiftUI uses these IDs to match old rows to new rows across re-renders. If the array is reordered, the task that was at index 1 is now at index 0, but SwiftUI still considers index 0 to be the same "row" as before, so it reuses the existing view — which now points at the wrong element. Using `ForEach($tasks)` lets SwiftUI use the UUID instead, so each row follows its task regardless of position.

---

### Issue 2: Captured Index Goes Stale on Mutation

**Problem:** The closure captures `index` at render time. If the array is modified between render and the moment the user taps the toggle — for example by an async update elsewhere — `tasks[index]` may refer to a shifted or out-of-bounds element, silently writing to the wrong task or crashing.

**Fix:** Replace the index-based subscript binding `$tasks[index].isCompleted` with the element binding `$task.isCompleted` from the `ForEach($tasks) { $task in ... }` pattern. The `// CHANGE 2` site shows this at the `Toggle` call site.

**Explanation:** `$tasks[index]` computes the binding by locking in `index` at the time the closure is created. If another part of the app inserts or removes an element before the user taps, `index` now points to the wrong slot in the array. The `ForEach($tasks) { $task in }` API hands you a `Binding<Task>` that is tied to the element's identity (UUID), not its current offset, so the binding always reaches through to the correct struct regardless of how the array shifts. An important related pitfall: even without async mutations, SwiftUI can call the closure body with a stale index when diffing large lists, making this a latent bug even in single-threaded apps.
