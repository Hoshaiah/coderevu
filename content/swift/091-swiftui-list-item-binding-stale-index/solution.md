## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Stale Index Binding in ForEach
// ------------------------------------------------------------------------

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
        // CHANGE 2: Add a NavigationView with an EditButton so deletion enters a safe edit mode and the fix is exercisable in normal use.
        NavigationView {
            List {
                // CHANGE 1: Iterate over `tasks` directly (using Task's Identifiable id) instead of `tasks.indices`. SwiftUI resolves each row to its stable UUID, so after a deletion the remaining rows bind to the correct elements and no stale index can form.
                ForEach($tasks) { $task in
                    Toggle(task.title, isOn: $task.isComplete)
                }
                .onDelete { offsets in
                    tasks.remove(atOffsets: offsets)
                }
            }
            .toolbar { EditButton() }
        }
    }
}
```

## Explanation

### Issue 1: Stale Index Binding After Deletion

**Problem:** After a user deletes a row, the remaining `ForEach` closures still hold the integer indices they captured when the view was last rendered. Toggling any remaining row writes to the old index in the now-shorter array — hitting the wrong task, or trapping with an index-out-of-bounds crash when the deleted item was the last one.

**Fix:** Replace `ForEach(tasks.indices, id: \.self) { index in ... $tasks[index].isComplete }` with `ForEach($tasks) { $task in ... $task.isComplete }`. SwiftUI resolves each row through the element's stable `UUID` identity, not a positional integer.

**Explanation:** `ForEach(tasks.indices, id: \.self)` tells SwiftUI to identify rows by their integer position. When the array shrinks after a deletion, SwiftUI does not immediately re-render every surviving row — it reuses the existing view nodes. Those nodes still close over the original index value, which is now either pointing at the wrong element or past the end of the array. Using `ForEach($tasks)` (available since iOS 15) passes a `Binding<Task>` keyed on `Task.id`; SwiftUI tracks each element by its `UUID` so the binding always resolves through the current array state at the time of the write. A related pitfall: even if you tried to work around the stale index by calling `firstIndex(where:)` inside the closure, you would still have a race if two state updates coalesce — the direct element binding avoids the problem entirely.

---

### Issue 2: No Edit Mode Entry Point

**Problem:** Without an `EditButton` in the toolbar, users have no standard way to enter edit mode to delete rows. Swipe-to-delete still works, but the absence of a navigation container and edit button means the deletion flow is harder to discover and the stale-index bug is harder to reproduce in a controlled way during testing.

**Fix:** Wrap the `List` in a `NavigationView` and add `.toolbar { EditButton() }` so the view has a standard entry point into edit mode, matching the expected SwiftUI list pattern.

**Explanation:** SwiftUI's `List` edit mode (triggered by `EditButton`) coordinates batch deletions through `onDelete` in a well-defined state transition. Without it, only the swipe gesture is available, and the view has no navigation chrome, which is atypical for a task-list screen. Adding `NavigationView` + `EditButton` costs nothing at runtime and makes the deletion path explicit and testable. It also ensures that the `onDelete` modifier is reachable in UI tests, so the fix for Issue 1 can be verified end-to-end.
