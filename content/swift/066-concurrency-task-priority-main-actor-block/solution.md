## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — High-Priority Task Blocks Main Actor
// ------------------------------------------------------------------------

@MainActor
class SearchViewModel: ObservableObject {
    @Published var results: [SearchResult] = []
    @Published var isSearching = false
    private let catalog: [CatalogItem]

    init(catalog: [CatalogItem]) {
        self.catalog = catalog
    }

    func performSearch(query: String) {
        isSearching = true
        // CHANGE 1: Use Task.detached so the closure runs on the cooperative thread pool instead of inheriting the @MainActor executor, keeping the main thread free during the CPU-bound ranking work.
        Task.detached(priority: .userInitiated) { [catalog = self.catalog] in
            let ranked = self.rankItems(catalog, query: query)
            // CHANGE 2: Explicitly hop back to the MainActor before writing to @Published properties, because Task.detached does not inherit the actor and mutating ObservableObject state off-actor causes data races and missed SwiftUI updates.
            await MainActor.run {
                self.results = ranked
                self.isSearching = false
            }
        }
    }

    // CHANGE 1: rankItems must be nonisolated so it can be called from the detached task without re-entering the MainActor, which would defeat the purpose of moving work off-thread.
    nonisolated private func rankItems(_ items: [CatalogItem], query: String) -> [SearchResult] {
        // Heavy CPU work: fuzzy scoring, sorting, etc.
        return items
            .compactMap { item in scoreItem(item, query: query) }
            .sorted { $0.score > $1.score }
    }

    nonisolated private func scoreItem(_ item: CatalogItem, query: String) -> SearchResult? {
        // ... expensive string distance computation ...
        return SearchResult(item: item, score: 0)
    }
}
```

## Explanation

### Issue 1: Task inherits MainActor, blocks main thread

**Problem:** Every time the user types a character, `rankItems` runs for 200–400 ms on the main thread. The keyboard freezes, scroll animations stall, and any in-flight UIKit transitions drop frames. This is invisible in the simulator because the host Mac has much faster cores.

**Fix:** Replace `Task { }` with `Task.detached(priority: .userInitiated) { }` and mark `rankItems` and `scoreItem` as `nonisolated`. This pushes the CPU work onto Swift's cooperative thread pool and removes any implicit actor hop back to the main thread inside those methods.

**Explanation:** A `Task {}` created inside a `@MainActor`-isolated function inherits the actor's executor. That means every `await`-free line inside the task — including the entire `rankItems` call tree — runs serially on the main thread, exactly as if it were synchronous code. `Task.detached` explicitly breaks that inheritance, so the closure is scheduled on a background worker thread. The `nonisolated` keyword is necessary because `rankItems` is a member of a `@MainActor` class; without it the Swift compiler treats any call to it as an actor-crossing hop and will re-enter the main actor, silently undoing the detach. A related pitfall: `Task.detached` with `.background` priority can be starved on heavily loaded devices; `.userInitiated` keeps latency reasonable for interactive search.

---

### Issue 2: @Published properties mutated off MainActor after background work

**Problem:** Once the heavy work runs off the main thread, writing to `self.results` and `self.isSearching` without returning to the `MainActor` is a data race. SwiftUI's diffing and `objectWillChange` publisher both expect to be driven from the main thread; off-thread writes can silently drop UI updates or trigger runtime exclusivity violations.

**Fix:** Wrap the two property assignments in `await MainActor.run { }` inside the detached task closure. This is the explicit actor hop that ensures the `@Published` writes happen on the correct executor.

**Explanation:** `Task.detached` runs with no actor context, so there is no automatic routing back to the main thread when the work finishes. `MainActor.run` schedules the closure on the main actor's serial executor and `await`s its completion, giving the same safety guarantee as code written directly inside a `@MainActor` function. The alternative — making `performSearch` itself `async` and using `async let` — also works, but requires the call site to be `async` too, which propagates changes further up the view layer. Using `MainActor.run` inside the detached task is the smallest, most contained fix. One edge case to watch: if the user types quickly and multiple detached tasks complete out of order, `results` can be overwritten with stale data; adding a generation counter or cancelling the previous task before starting a new one prevents that regression.
