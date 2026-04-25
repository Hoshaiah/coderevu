## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Task Modifier Missing ID Reruns Stale Work
// ------------------------------------------------------------------------

struct ArticleDetailView: View {
    let articleId: String
    @State private var content: String?
    @State private var isLoading = false
    private let service: ArticleService

    init(articleId: String, service: ArticleService) {
        self.articleId = articleId
        self.service = service
    }

    var body: some View {
        Group {
            if let content = content {
                ScrollView {
                    Text(content).padding()
                }
            } else if isLoading {
                ProgressView()
            }
        }
        // CHANGE 2: Reset state eagerly in onAppear so stale content is cleared before the task even starts, eliminating the flash of old content.
        .onAppear {
            content = nil
            isLoading = false
        }
        // CHANGE 1: Pass articleId as the task id so SwiftUI cancels the in-flight task and restarts it whenever articleId changes, preventing stale-write races.
        .task(id: articleId) {
            isLoading = true
            do {
                content = try await service.fetch(articleId: articleId)
            } catch {
                content = nil
            }
            isLoading = false
        }
    }
}
```

## Explanation

### Issue 1: `.task` Modifier Missing `id` Cancels Nothing

**Problem:** When the user swipes to a new article, SwiftUI creates a new `ArticleDetailView` with a different `articleId`, but because `.task` has no `id` parameter, SwiftUI does not cancel the previous async work. Two (or more) concurrent fetches run simultaneously, and whichever one finishes last wins — which may be the fetch for an older article, leaving stale text on screen permanently.

**Fix:** Add `id: articleId` to the `.task` modifier: `.task(id: articleId)`. This single token addition tells SwiftUI to cancel the running task and launch a new one every time `articleId` changes.

**Explanation:** SwiftUI's `.task(id:)` overload ties the task lifetime to the value of `id`. When `id` changes, SwiftUI calls `cancel()` on the `Task` it holds internally and then creates a new one. Without an `id`, `.task` behaves like `.onAppear` — it fires once when the view is first inserted and is never restarted or cancelled for that view instance. In a `NavigationStack`, if views are reused or if both the old and new `ArticleDetailView` are alive briefly during the swipe animation, both tasks are live at the same time. The slower network response (often the first one, whose server-side work was already in flight) can arrive after the faster one and overwrite `content` with the wrong article. Providing a stable, unique `id` that matches the meaningful input to the async work is the standard pattern for avoiding this race.

---

### Issue 2: State Reset Inside Task Body Causes Stale-Content Flash

**Problem:** `content = nil` and `isLoading = true` are the first lines executed inside the `.task` closure. Because the closure is `async`, there is a small scheduling gap between when SwiftUI invokes the closure and when the main actor actually runs those assignments. During that gap, the old `content` value remains set, so the previous article's text stays visible — sometimes long enough for the user to notice a flash of the wrong article before it clears.

**Fix:** Move `content = nil` and `isLoading = false` into a new `.onAppear` modifier that runs synchronously before the task body executes. The `.task` body then starts with a clean slate without relying on async scheduling order.

**Explanation:** `.onAppear` is called synchronously on the main thread as part of the view update cycle, so its body runs before any async work begins. The `.task` closure, even though its first lines are not `await` points, is still dispatched as a new `Task` and scheduled on the main actor — meaning it runs after the current run-loop turn completes. Resetting state in `.onAppear` guarantees the view renders with `nil` content and no spinner before the fetch starts, giving the user immediate visual feedback that a new article is loading rather than a flash of old text. A related pitfall: if you later add a `guard` or early-return inside `.task` before the reset lines, the reset would never run at all, making `.onAppear` the safer home for this initialization.
