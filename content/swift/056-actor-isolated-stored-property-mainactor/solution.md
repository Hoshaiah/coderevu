## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Property Updated Off Main Thread
// ------------------------------------------------------------------------

import Foundation
import Combine

@MainActor
class FeedLoader: ObservableObject {
    @Published var articles: [String] = []
    @Published var isLoading: Bool = false

    func loadFeed(url: URL) {
        isLoading = true
        // CHANGE 1: Replace Task.detached with Task so the closure inherits the @MainActor context; background work is still done off-thread by URLSession's async API, but property writes hop back to the main actor automatically.
        // CHANGE 2: Capture self weakly to avoid extending the object's lifetime for the duration of a network request.
        Task { [weak self] in
            guard let self else { return }
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                let decoded = try JSONDecoder().decode([String].self, from: data)
                // These writes now execute on the main actor because the enclosing Task inherits @MainActor isolation.
                self.articles = decoded
                self.isLoading = false
            } catch {
                self.isLoading = false
            }
        }
    }
}
```

## Explanation

### Issue 1: Off-Actor Property Writes via Detached Task

**Problem:** Users see nondeterministic crashes (`EXC_BAD_ACCESS`) and garbled article counts. The Thread Sanitizer immediately flags a data race on `articles`. The crash is harder to reproduce on faster devices because the race window is smaller.

**Fix:** Replace `Task.detached` with `Task` (remove the `detached` qualifier). The `Task` initializer at the call site in `loadFeed` inherits the surrounding `@MainActor` isolation, so the closure body — including the writes to `self.articles` and `self.isLoading` — executes on the main actor.

**Explanation:** `Task.detached` deliberately severs all actor context from the enclosing scope. That means the closure does not inherit `@MainActor`, even though the class is annotated with it. Swift's actor isolation only protects property access when code actually runs on that actor; annotation alone does not inject synchronization into a detached task. When the decoded array is assigned to `self.articles` from an arbitrary thread, SwiftUI is simultaneously reading `articles` on the main thread to render the view — a classic read/write race. `Task` (without `detached`) borrows the caller's actor context, so all awaited continuations resume on the main actor. URLSession's async `data(from:)` still does its I/O on a background thread; the actor switch only applies to the code that runs between `await` suspension points inside the task.

---

### Issue 2: Strong Self Capture Preventing Deinitialization

**Problem:** Each call to `loadFeed` keeps `FeedLoader` alive until the network request completes, even after the owning view has been dismissed. This can cause stale UI updates to fire on an object the user believes is gone, and it accumulates live `FeedLoader` instances if the user navigates away and back quickly.

**Fix:** Add `[weak self]` to the `Task` capture list and guard at the top of the closure with `guard let self else { return }`. This matches the pattern in the reference solution's `Task { [weak self] in` line.

**Explanation:** A `Task` closure holds a strong reference to every captured value by default. Without `[weak self]`, the `FeedLoader` object's reference count stays above zero for as long as the task runs. If the SwiftUI view that owns the loader is dismissed mid-fetch, the loader is not deallocated until the task finishes, and the resulting property writes will still trigger `objectWillChange` on an object that nothing is observing — wasted work at best, and surprising behavior if there are side effects. Using `[weak self]` allows the loader to be deallocated immediately when the view releases it; the `guard` then exits the task cleanly instead of crashing on a nil forced-unwrap.
