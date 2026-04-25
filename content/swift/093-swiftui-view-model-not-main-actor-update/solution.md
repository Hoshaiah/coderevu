## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Published Update Off Main Thread
// ------------------------------------------------------------------------

import SwiftUI
import Combine

class FeedViewModel: ObservableObject {
    @Published var articles: [Article] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String? = nil

    func fetchArticles() {
        // CHANGE 2: Wrap the initial isLoading mutation in MainActor.run so it is always set on the main thread regardless of the caller's context.
        Task {
            await MainActor.run { isLoading = true }
            do {
                let fetched = try await ArticleService.shared.getLatest()
                // CHANGE 1: Dispatch back to the main actor before mutating @Published properties; Task bodies run on a cooperative thread pool, not the main thread.
                await MainActor.run {
                    articles = fetched
                    isLoading = false
                }
            } catch {
                // CHANGE 1: Same fix for the error path — errorMessage and isLoading must be updated on the main thread.
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}

struct FeedView: View {
    @StateObject private var viewModel = FeedViewModel()

    var body: some View {
        List(viewModel.articles, id: \.id) { article in
            Text(article.title)
        }
        .onAppear {
            viewModel.fetchArticles()
        }
    }
}
```

## Explanation

### Issue 1: @Published mutations off the main thread

**Problem:** Inside the `Task` closure, both the success path (`articles = fetched`, `isLoading = false`) and the error path (`errorMessage = error.localizedDescription`, `isLoading = false`) write to `@Published` properties from whichever thread the Swift cooperative thread pool picks. SwiftUI requires all `ObservableObject` mutations to happen on the main thread. The result is the runtime warning `Publishing changes from background threads is not allowed`, partial list renders on older devices, and UIKit consistency crashes on some builds.

**Fix:** Wrap every assignment to a `@Published` property inside `await MainActor.run { ... }` at both the success and error branches (the two `CHANGE 1` sites). This guarantees the mutation and the resulting `objectWillChange` publisher fire on the main thread before SwiftUI re-renders.

**Explanation:** A plain `Task { }` inherits no actor context — it runs on the shared cooperative thread pool. When code in that task writes to a property marked `@Published`, the `objectWillChange` signal fires immediately on that background thread. SwiftUI's diffing and UIKit backing layer are not thread-safe, so simultaneous reads from the main thread and writes from a background thread cause data races. `MainActor.run` suspends the current task, resumes on the main actor (the main thread), executes the closure, and then returns. This is equivalent to `DispatchQueue.main.async` but integrates cleanly with Swift concurrency and avoids the overhead of a new closure dispatch per property. A related pitfall: marking the whole class `@MainActor` is an alternative, but it changes the calling contract for every method, which can be a larger refactor than intended.

---

### Issue 2: isLoading set before Task starts, potentially off-thread

**Problem:** `isLoading = true` sits outside the `Task` block and runs synchronously on whatever thread called `fetchArticles()`. When `fetchArticles()` is triggered from `.onAppear`, the call originates on the main thread and this specific line is safe — but it is a fragile assumption. If the call site ever moves to a background context (e.g., a Combine sink, a background refresh handler), the mutation will also be off-thread with the same consequences as Issue 1.

**Fix:** Move `isLoading = true` inside the `Task` and wrap it in `await MainActor.run { isLoading = true }` (the `CHANGE 2` site), so the property is always set on the main thread regardless of where `fetchArticles()` is called from.

**Explanation:** The original placement before the `Task` block looks harmless because `.onAppear` fires on the main thread, but it ties correctness to call-site context that is invisible at the point of the mutation. By moving the mutation inside `MainActor.run` at the top of the `Task`, the function is self-contained and safe to call from any thread. This also keeps the loading state transition logically grouped with the rest of the async work, making the control flow easier to read and audit.
