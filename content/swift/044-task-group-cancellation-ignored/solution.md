## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Task Cancellation Error Silently Dropped
// ------------------------------------------------------------------------

actor ImagePrefetcher {
    private var cache: [URL: Data] = [:]

    func prefetchAll(urls: [URL]) async {
        // CHANGE 2: Use withThrowingTaskGroup so cancellation of the parent Task propagates and cancels child tasks; the group itself will cancel remaining children when an error (including CancellationError) is thrown.
        await withThrowingTaskGroup(of: Void.self) { group in
            for url in urls {
                group.addTask {
                    try await self.prefetch(url: url)
                }
            }
            // Drain results so thrown CancellationErrors are observed and the group can tear down.
            try? await group.waitForAll()
        }
    }

    // CHANGE 2: Mark prefetch as throwing so it can propagate CancellationError up to the task group.
    private func prefetch(url: URL) async throws {
        // CHANGE 1: Call checkCancellation() with `try` (not `try?`) so a CancellationError is actually thrown and execution stops here instead of falling through to the download.
        try Task.checkCancellation()

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            cache[url] = data
        } catch {
            // CHANGE 3: Re-throw CancellationError (and URLError.cancelled) so cancellation is not silently swallowed; only ignore genuine download errors like network timeouts.
            if error is CancellationError { throw error }
            if let urlErr = error as? URLError, urlErr.code == .cancelled { throw CancellationError() }
            // Non-cancellation download errors are still ignored (prefetch is best-effort).
        }
    }
}
```

## Explanation

### Issue 1: Cancellation check silently discarded

**Problem:** The code calls `_ = try? Task.checkCancellation()`, which converts any thrown `CancellationError` into `nil` and discards it. Execution continues unconditionally to the `URLSession.shared.data(from:)` call even when the task is already cancelled, so the download runs anyway.

**Fix:** Replace `_ = try? Task.checkCancellation()` with `try Task.checkCancellation()` (no `try?`), and mark `prefetch` as `throws` so the error propagates instead of being absorbed.

**Explanation:** `Task.checkCancellation()` signals cancellation by throwing `CancellationError`. Wrapping it in `try?` is the same as writing `catch { }` around it — the error is caught and thrown away before it can do anything. After that line the function has no idea cancellation was requested and proceeds normally. Removing `try?` lets the thrown error unwind the function immediately, skipping the download. A related pitfall: even a correct `checkCancellation()` only fires at that one synchronous point; if the task is cancelled after the check but before `URLSession.shared.data` starts, the download may still begin — which is why issues 2 and 3 are also needed.

---

### Issue 2: `withTaskGroup` does not cancel child tasks on parent cancellation

**Problem:** `withTaskGroup(of:)` (the non-throwing variant) does not automatically cancel its children when the enclosing `Task` is cancelled. All `group.addTask` closures run to completion regardless. This is why memory profiling shows URLSession traffic continuing after the gallery is dismissed.

**Fix:** Replace `withTaskGroup(of: Void.self)` with `withThrowingTaskGroup(of: Void.self)`, mark child task closures as `try await self.prefetch(url:)`, and drain the group with `try? await group.waitForAll()` so thrown `CancellationError`s are observed and the group cancels remaining children.

**Explanation:** Swift structured concurrency uses cooperative cancellation. When a parent `Task` is cancelled, child tasks created with `addTask` get their cancellation flag set, but they only stop if they actually check that flag (via `checkCancellation()` or a cancellation-aware API). With the throwing group variant, when one child throws a `CancellationError`, the group marks all other children cancelled and stops adding new work. Without the throwing variant the group has no mechanism to propagate the cancellation signal outward, so children keep running. `URLSession.shared.data(from:)` is cancellation-aware and will throw `URLError.cancelled` when the enclosing task is cancelled, but only if the group has actually forwarded the cancellation to its children.

---

### Issue 3: `catch` block swallows `CancellationError` from URLSession

**Problem:** When the parent task is cancelled, `URLSession.shared.data(from:)` throws `URLError` with code `.cancelled`. The blanket `catch { }` discards this error, so the child task exits normally rather than propagating the cancellation signal back to the group. The group never learns that the task was cancelled.

**Fix:** Inside the `catch` block, re-throw if the error is a `CancellationError` or a `URLError` with code `.cancelled` by converting it to `CancellationError()` and re-throwing. All other errors remain silently ignored because prefetching is best-effort.

**Explanation:** A child task's cancellation only propagates to the group if the child actually throws. If `catch` eats every error, the group sees a normally completing child and does not cancel siblings. Checking for `CancellationError` and `URLError.cancelled` specifically — and re-throwing them — keeps the best-effort behaviour for real network errors (timeouts, DNS failures, HTTP errors) while allowing structured concurrency to do its job for cancellation. A related pitfall: always check `CancellationError` before checking `URLError` because `URLSession` may report cancellation as either type depending on timing.
