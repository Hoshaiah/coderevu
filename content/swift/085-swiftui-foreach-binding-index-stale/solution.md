## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — ForEach Index Binding Stale After Delete
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
        Task(id: UUID(), title: "Write tests", isCompleted: false)
    ]

    var body: some View {
        List {
            // CHANGE 1: Iterate over tasks directly (using Task.id as stable identity) instead of tasks.indices with id: \.self, so SwiftUI tracks each row by UUID and never holds a stale integer index after deletion.
            ForEach($tasks) { $task in
                // CHANGE 2: Bind the Toggle directly to the element binding provided by ForEach($tasks), eliminating any index subscript that could be out-of-range or point to the wrong element after a deletion.
                Toggle(task.title, isOn: $task.isCompleted)
            }
            .onDelete { indexSet in
                tasks.remove(atOffsets: indexSet)
            }
        }
    }
}
```

## Explanation

### Issue 1: Stale Index Captures After Deletion

**Problem:** After deleting a task from the middle or beginning of the list, toggling any remaining row either mutates the wrong task or crashes with an index-out-of-range error. The view still references old integer positions that no longer correspond to the same elements.

**Fix:** Replace `ForEach(tasks.indices, id: \.self) { index in` with `ForEach($tasks) { $task in }`. The loop now receives a `Binding<Task>` for each element, and the `Toggle` binds to `$task.isCompleted` rather than `$tasks[index].isCompleted`.

**Explanation:** When you iterate over `tasks.indices` and capture `index` inside the closure, SwiftUI stores that integer for the lifetime of the row view. After a deletion at position 0, the element that was at index 1 is now at index 0, but the captured closure for the second row still holds `index == 1`. When SwiftUI re-evaluates the toggle's binding it writes to `tasks[1]`, which is now the third original task — the wrong one. If only two tasks remain after deletion, writing to `tasks[1]` when the deleted item was the last one is safe by coincidence, which is why end-of-list deletes appear harmless. Using `ForEach($tasks)` makes SwiftUI use each `Task`'s `id: UUID` as the stable identity for diffing. The binding it passes into the closure always refers to the correct element by identity, not by position, so deletions at any index leave every surviving row's binding intact.

---

### Issue 2: Integer Indices Used as Row Identity

**Problem:** Passing `id: \.self` on integer indices tells SwiftUI that the integer itself is the unique, stable identity of each row. When items are removed, SwiftUI sees the same integers it saw before and concludes the rows at those positions are the same rows — so it reuses the old row views and their captured state without updating them.

**Fix:** `ForEach($tasks)` relies on `Task` conforming to `Identifiable` (via its `UUID`-typed `id` property), which it already does. No explicit `id:` parameter is needed; SwiftUI automatically uses `Task.id` to track rows.

**Explanation:** SwiftUI's diffing algorithm compares the `id` values from one render pass to the next to decide which views to insert, remove, or reuse. When `id` is an integer index, the value `1` in the old list and `1` in the new list look identical even though the element at position 1 changed after a deletion. SwiftUI therefore reuses the row view for index 1 without updating its binding, leaving the closure pointing at whatever element now happens to sit at that offset. A `UUID`-based identity is unique per task and never changes, so after a deletion SwiftUI correctly identifies which row disappeared and rebuilds the remaining rows' bindings from scratch against the updated array positions.
