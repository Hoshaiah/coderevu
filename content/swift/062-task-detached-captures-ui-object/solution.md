## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Detached Task Mutates UI Off Main
// ------------------------------------------------------------------------

import UIKit

class FeedViewController: UIViewController, UITableViewDataSource {
    private var tableView = UITableView()
    private var posts: [Post] = []
    private let feedService: FeedService

    init(feedService: FeedService) {
        self.feedService = feedService
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    @objc func handleRefresh() {
        // CHANGE 2: Capture self weakly so the detached task does not extend the view controller's lifetime beyond its natural end.
        Task.detached { [weak self] in
            guard let self = self else { return }
            do {
                let newPosts = try await self.feedService.fetchLatestPosts()
                // CHANGE 1: Hop back to the MainActor before touching posts or the table view so all UI mutations happen on the main thread.
                await MainActor.run {
                    self.posts = newPosts
                    self.tableView.reloadData()
                }
            } catch {
                print("Fetch failed: \(error)")
            }
        }
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return posts.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "Cell") ?? UITableViewCell()
        cell.textLabel?.text = posts[indexPath.row].title
        return cell
    }

    struct Post { let title: String }
    class FeedService { func fetchLatestPosts() async throws -> [Post] { return [] } }
}
```

## Explanation

### Issue 1: UI Mutation Off Main Thread

**Problem:** `self.posts = newPosts` and `self.tableView.reloadData()` both execute on whatever thread the `Task.detached` body runs on — a Swift concurrency cooperative thread pool thread, not the main thread. This races with UIKit's own reads of `posts` inside `numberOfRowsInSection` and `cellForRowAt`, producing `EXC_BAD_ACCESS` and table-view hierarchy inconsistency errors. The problem is more visible on multi-core devices because the background and main threads truly run in parallel.

**Fix:** Wrap the two mutation lines in `await MainActor.run { ... }` (CHANGE 1). This suspends the background task, schedules the closure on the main actor, executes `self.posts = newPosts` and `self.tableView.reloadData()` there, then resumes the background task.

**Explanation:** UIKit is not thread-safe; every property access and method call on a `UIView` or its data source must happen on the main thread. `Task.detached` deliberately opts out of any actor context, so there is no inherited main-actor isolation — the entire closure body runs on a background thread. `MainActor.run` is the correct escape hatch: it enqueues work on the main actor's serial executor, which is backed by the main thread, eliminating the race. An alternative is to mark `handleRefresh` (or the whole class) `@MainActor`, but that would block the main thread during the network call unless the fetch itself is `async`; using `await MainActor.run` only after the network work completes is the right granularity.

---

### Issue 2: Strong Self Capture Prevents Deallocation

**Problem:** The original `Task.detached` closure captures `self` strongly. If the user navigates away before `fetchLatestPosts` returns, the view controller cannot be deallocated because the live task holds a strong reference to it. The controller stays alive, its view hierarchy may be partially torn down, and any subsequent UI mutation crashes or silently corrupts state.

**Fix:** Add `[weak self]` to the capture list (CHANGE 2) and guard against `self` being nil at the top of the closure with `guard let self = self else { return }`.

**Explanation:** `Task.detached` runs independently of structured concurrency, so Swift's task-tree cancellation does not automatically cancel it when the parent scope ends. The task keeps the objects it captures alive for its entire duration. A weak capture breaks the retain cycle: if the view controller is dismissed and deallocated, `self` becomes `nil` and the guard exits the task early, skipping stale UI updates. One related pitfall: after `guard let self = self`, the re-bound `self` is a strong reference for the rest of that scope, so any `await` inside could in theory run after a dismiss; wrapping the post-await work in another `guard` or checking a cancellation flag is worth considering for long-running tasks.
