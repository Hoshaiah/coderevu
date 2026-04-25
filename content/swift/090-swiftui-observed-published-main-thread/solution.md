## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — ObservableObject Published Off Main Thread
// ------------------------------------------------------------------------

import SwiftUI
import Combine

@MainActor // CHANGE 1: Marking the class @MainActor ensures every method and property mutation runs on the main thread, fixing the off-thread @Published mutation that caused rendering crashes.
class FeedViewModel: ObservableObject {
    @Published var articles: [String] = []
    @Published var isLoading: Bool = false

    func fetchArticles() {
        Task {
            isLoading = true
            do {
                let fetched = try await loadFromNetwork()
                articles = fetched
            } catch {
                print("Fetch error: \(error)")
            }
            isLoading = false
        }
    }

    private func loadFromNetwork() async throws -> [String] {
        try await Task.sleep(nanoseconds: 500_000_000)
        return ["Article 1", "Article 2", "Article 3"]
    }
}

struct FeedView: View {
    @StateObject var viewModel = FeedViewModel() // CHANGE 2: @StateObject instead of @ObservedObject so SwiftUI owns the instance and does not recreate it on re-render, preventing state loss.

    var body: some View {
        List(viewModel.articles, id: \.self) { article in
            Text(article)
        }
        .onAppear { viewModel.fetchArticles() }
    }
}
```

## Explanation

### Issue 1: @Published mutations off main thread

**Problem:** After migrating from completion handlers to `async/await`, the `Task { }` block inside `fetchArticles` runs on a cooperative thread pool rather than the main thread. Assignments like `articles = fetched` and `isLoading = true/false` therefore happen off the main thread. SwiftUI and UIKit require UI state changes on the main thread; violating this causes intermittent hangs, "UIView/CALayer is not thread-safe" console warnings, and crashes in the render path.

**Fix:** The `@MainActor` attribute is added to the `FeedViewModel` class declaration. This ensures that all method bodies and stored-property accesses on `FeedViewModel` are dispatched to the main actor automatically, so `articles = fetched` always executes on the main thread regardless of which thread resumes the `Task`.

**Explanation:** Swift's `async/await` resumes continuations on whichever thread the executor chooses — after `await loadFromNetwork()` returns, you are on a background thread unless you explicitly hop back. The old completion-handler code explicitly called `DispatchQueue.main.async { ... }` before touching published properties; the new code dropped that hop. Annotating the class `@MainActor` reinstates the equivalent guarantee at the type level: every non-`nonisolated` method on the class is automatically isolated to the main actor. The `loadFromNetwork` function is still allowed to suspend freely on background threads because Swift suspends out of the actor during `await` and hops back when the result is ready. A related pitfall: if you only annotate individual methods rather than the whole class, it is easy to miss a property assignment and reintroduce the bug.

---

### Issue 2: @ObservedObject with locally-created instance loses state

**Problem:** When `@ObservedObject var viewModel = FeedViewModel()` is written inside a `View`, SwiftUI does not own the object's lifetime. If the parent view re-renders (for any reason), SwiftUI is allowed to discard and recreate the `FeedView` struct, which constructs a fresh `FeedViewModel()` and throws away any in-progress fetch or loaded articles.

**Fix:** The declaration is changed from `@ObservedObject var viewModel = FeedViewModel()` to `@StateObject var viewModel = FeedViewModel()`. `@StateObject` tells SwiftUI to create the object exactly once for the lifetime of the view and to retain it across re-renders.

**Explanation:** `@ObservedObject` is designed for objects that are created elsewhere and passed in; when you initialize the object inline, SwiftUI has no mechanism to preserve it between struct re-evaluations. `@StateObject` was introduced in iOS 14 precisely to cover the "I need to own this object" pattern: SwiftUI holds the object in stable storage tied to the view's identity in the render tree. Without this fix, a parent view state change while a fetch is in flight would silently discard the running `Task` and the partially loaded data, which can appear as intermittent blank lists or unexpected repeated network calls. The rule of thumb is: if you write `= SomeClass()` at the declaration site, use `@StateObject`; if the instance is injected from outside, use `@ObservedObject`.
