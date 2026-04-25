## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — task Modifier Captures Stale Value
// ------------------------------------------------------------------------

struct ArticleDetailView: View {
    let articleID: String
    @State private var article: Article?
    @State private var isLoading = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let article {
                ArticleBodyView(article: article)
            }
        }
        .task(id: articleID) {
            isLoading = true
            // CHANGE 2: Clear stale article immediately so the previous article is not shown while the new fetch is in flight and cannot be overwritten by a late response from the old task.
            article = nil
            let id = articleID
            do {
                let fetched = try await ArticleService.shared.fetch(id: id)
                // CHANGE 1: Move the cancellation check to AFTER the await returns, before touching state, and also verify the fetched ID still matches the current articleID as a belt-and-suspenders guard against race conditions where cancellation was not delivered in time.
                guard !Task.isCancelled, id == articleID else { return }
                article = fetched
                isLoading = false
            } catch {
                isLoading = false
            }
        }
    }
}
```

## Explanation

### Issue 1: Cancellation check does not prevent stale write

**Problem:** Users who tap through articles quickly see content from a previous selection appear briefly or permanently. Network traces confirm multiple requests complete out of order, and the detail view renders the wrong article.

**Fix:** Replace `try Task.checkCancellation()` with `guard !Task.isCancelled, id == articleID else { return }` immediately after the `await` returns and before any state mutation (CHANGE 1).

**Explanation:** `.task(id:)` cancels the old task by setting its cooperative cancellation flag when `articleID` changes. However, if the old task's network request already completed and control resumed past the `await`, the task's cancellation flag may have been set but no suspension point was hit to throw `CancellationError`. `try Task.checkCancellation()` only throws if cancellation was set; it does not undo work already done. So the old task proceeds to write `article = fetched` with a result belonging to the previous `articleID`. The fix checks `Task.isCancelled` (non-throwing, safe to call anywhere) and also compares `id == articleID` as a secondary guard: even if the Swift runtime delivers cancellation slightly late, the ID comparison catches the mismatch. Both checks happen before state is mutated, so no stale data reaches the view.

---

### Issue 2: Previous article persists during new fetch, enabling stale overwrite window

**Problem:** When the user selects a new article, the old article remains in `@State private var article` while the new fetch is in-flight. If a stale response from a prior task manages to slip past any cancellation check, it overwrites the correct in-progress state, and the user sees old content.

**Fix:** Add `article = nil` immediately after `isLoading = true` and before the `await`, at the start of each new task invocation (CHANGE 2).

**Explanation:** Without clearing `article`, two problems coexist. First, the view shows stale content during the loading spinner phase, which is misleading. Second, and more importantly, if an old task's response arrives and passes a cancellation check (due to a race), it writes into `article` — and because the new task has not yet written anything, the assignment looks valid to both the runtime and the view. Setting `article = nil` at the top of each task run closes this window: the only valid value in `article` is one written by the current task after its own guard passes. A related pitfall is that resetting to `nil` causes a brief blank frame instead of a stale article, which is the correct user-facing behavior when navigating to new content.
