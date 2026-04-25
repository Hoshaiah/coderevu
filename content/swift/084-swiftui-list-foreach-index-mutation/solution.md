## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — ForEach Index Mutation Crash
// ------------------------------------------------------------------------

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
            // CHANGE 1 & 2: Iterate over `tasks` directly (not `tasks.indices`) so SwiftUI uses each Task's stable UUID as the row identity instead of a mutable integer index, eliminating stale-index out-of-range crashes.
            ForEach(tasks) { task in
                Text(task.title)
            }
            .onDelete { indexSet in
                tasks.remove(atOffsets: indexSet)
            }
        }
    }
}
```

## Explanation

### Issue 1: Stale integer index causes out-of-range crash

**Problem:** When a user deletes an item, SwiftUI's internal diffing engine may still hold a reference to the old integer index for a brief reconciliation window. If that stale index no longer exists in the now-shorter array, accessing `tasks[index]` crashes with `Fatal error: Index out of range`. The crash is more frequent on single-item lists because deleting the only element immediately makes index `0` invalid.

**Fix:** Replace `ForEach(tasks.indices, id: \.self) { index in Text(tasks[index].title) }` with `ForEach(tasks) { task in Text(task.title) }`. SwiftUI now calls `onDelete` with an `IndexSet` that is always computed relative to the current array, so `tasks.remove(atOffsets:)` receives valid offsets.

**Explanation:** `ForEach(tasks.indices, id: \.self)` tells SwiftUI that each row's identity is the integer `0`, `1`, `2`, etc. When the array shrinks, SwiftUI's reconciler can race between updating its internal row map and invoking the `onDelete` closure with an `IndexSet` derived from its (now stale) snapshot. The closure then tries to delete an index that the array no longer contains. Using `ForEach(tasks)` hands SwiftUI the stable `UUID` from each `Task.id`, so the framework tracks rows by value identity across mutations and always computes `IndexSet` values against the live array. A related pitfall: adding a manual bounds check (e.g., `guard index < tasks.count`) masks the symptom but does not stop SwiftUI from eventually re-entering the same race on the next render cycle, which is why the team's earlier patch failed in TestFlight.

---

### Issue 2: Iterating indices breaks Identifiable row tracking

**Problem:** `Task` conforms to `Identifiable` with a `UUID`, but `ForEach(tasks.indices, id: \.self)` ignores that conformance entirely and uses the integer position as the row key. SwiftUI's diff algorithm therefore treats any two rows that happen to occupy the same position as the same row, causing incorrect animations, wrong rows being deleted visually, or leftover ghost cells after a deletion.

**Fix:** Change the `ForEach` initializer to `ForEach(tasks)`, which automatically uses `Task.id` (the `UUID`) as the stable identity for each row, honoring the `Identifiable` conformance that `Task` already declares.

**Explanation:** SwiftUI's list diffing works by comparing identity tokens between renders. When you use integer indices as tokens, inserting or removing any element shifts every subsequent index, so SwiftUI sees all those rows as "changed" and may animate or reuse them incorrectly. With `UUID`-based identity, each row has a token that never changes regardless of where in the array the element moves. This means deletions animate only the removed row, insertions appear in the right place, and the framework never confuses two distinct tasks just because they end up at the same position after a mutation.
