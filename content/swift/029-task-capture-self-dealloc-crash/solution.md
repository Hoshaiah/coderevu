## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Unowned Self Crashes After Dealloc
// ------------------------------------------------------------------------

class SearchViewController: UIViewController {
    var results: [SearchResult] = []
    var currentTask: Task<Void, Never>?

    func performSearch(query: String) {
        currentTask?.cancel()
        // CHANGE 1: Use [weak self] instead of [unowned self] so that if the view controller is deallocated while the Task is in-flight, self becomes nil rather than a dangling pointer.
        currentTask = Task { [weak self] in
            guard !Task.isCancelled else { return }
            do {
                let fetched = try await SearchService.shared.fetch(query: query)
                // CHANGE 1: Guard on weak self after the await so we bail out safely if the view controller was deallocated while the fetch was running.
                guard let self = self else { return }
                // CHANGE 2: Dispatch UI mutations back to the main actor so UIKit is always touched on the main thread.
                await MainActor.run {
                    self.results = fetched
                    self.reloadTable()
                }
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

## Explanation

### Issue 1: `[unowned self]` Dangling Reference in Async Task

**Problem:** When the view controller is dismissed while a network fetch is in-flight, `SearchViewController` is deallocated. The `Task` closure holds an `unowned` reference, which becomes a dangling pointer the moment deallocation happens. When the fetch completes and the closure resumes at `self.results = fetched`, it dereferences that dangling pointer and the process crashes with `EXC_BAD_ACCESS`.

**Fix:** Replace `[unowned self]` with `[weak self]` and add `guard let self = self else { return }` immediately after the `await` suspension point. This is the `CHANGE 1` site in the reference solution.

**Explanation:** `unowned` tells Swift "this reference will always be valid for the lifetime of the closure — skip the nil check". That promise breaks as soon as the referent can be deallocated before the closure finishes, which is exactly what happens here: the closure suspends at `await`, control returns to the caller, the view controller gets dismissed, ARC drops its retain count to zero and frees the memory, then the closure resumes and reads freed memory. `weak` solves this by zeroing the reference on deallocation instead of leaving a dangling pointer. The `guard let` after the `await` turns that optional into a concrete reference and exits cleanly if the controller is already gone, which is the correct behavior — there is no UI to update anymore.

---

### Issue 2: UIKit Mutations Off the Main Thread

**Problem:** `Task { }` inherits the actor context of its enclosing scope, but after an `await` on a non-actor-isolated function like `SearchService.shared.fetch`, execution can resume on a cooperative thread-pool thread. Assigning `self.results` and calling `tableView.reloadData()` from that thread corrupts UIKit's internal state and can cause silent data races or crashes that are intermittent and hard to reproduce in testing.

**Fix:** Wrap `self.results = fetched` and `self.reloadTable()` inside `await MainActor.run { … }` at the `CHANGE 2` site, ensuring those mutations always run on the main thread.

**Explanation:** UIKit is not thread-safe. `tableView.reloadData()` internally reads and writes layout state that must only be touched from the main thread. After the `await` suspension, Swift's structured concurrency resumes the closure on whichever thread the runtime picks from its cooperative pool, which is not the main thread unless the enclosing type is `@MainActor`-isolated. `MainActor.run` schedules the block on the main actor's serial executor (the main thread) and suspends the calling task until it completes, so the UIKit calls are guaranteed to run there. An alternative is to mark `SearchViewController` itself as `@MainActor`, which would propagate isolation automatically and is worth considering if most of its methods touch UIKit.
