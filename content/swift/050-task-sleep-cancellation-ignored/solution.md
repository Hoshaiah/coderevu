## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Task.sleep Ignores Cancellation Token
// ------------------------------------------------------------------------

import Foundation

class PollingWorker {
    private var task: Task<Void, Never>?

    func start() {
        task = Task {
            while !Task.isCancelled {
                await fetchConfig()
                // CHANGE 2: Guard cancellation before sleeping so a cancel that arrived during fetchConfig exits immediately without waiting 30 seconds.
                guard !Task.isCancelled else { break }
                // CHANGE 1: Use `try await` without `try?` and wrap in `do/catch` so a CancellationError thrown by Task.sleep actually breaks the loop instead of being silently discarded.
                do {
                    try await Task.sleep(nanoseconds: 30_000_000_000)
                } catch {
                    break
                }
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func fetchConfig() async {
        // URLSession request — respects cancellation
        _ = try? await URLSession.shared.data(from: URL(string: "https://example.com/config")!)
    }
}
```

## Explanation

### Issue 1: `try?` Silences `Task.sleep` Cancellation

**Problem:** After the app backgrounds and `task.cancel()` is called, the running `Task.sleep` call receives a `CancellationError` — but `try?` converts that error to `nil` and execution continues normally. The sleep runs to completion (~30 s), `fetchConfig` fires one more time, and the process may still be active when the OS tries to suspend it, producing `URLError` timeouts at the next foreground.

**Fix:** Replace `try? await Task.sleep(...)` with a `do { try await Task.sleep(...) } catch { break }` block (CHANGE 1). When cancellation arrives, `Task.sleep` throws, the `catch` block runs, and the loop exits immediately.

**Explanation:** `Task.sleep` is a cooperative cancellation point — it checks the task's cancellation flag and throws `CancellationError` when the task has been cancelled. `try?` is syntactic sugar that catches any thrown error and returns `nil`, so the `CancellationError` is consumed silently and the surrounding code never sees it. Wrapping the call in an explicit `do/catch` lets the error propagate to a handler that can actually act on it. Any non-cancellation error (unlikely from `Task.sleep`, but possible in future Swift versions) is also handled safely by the same `catch` clause.

---

### Issue 2: Cancellation During `fetchConfig` Still Triggers Full Sleep

**Problem:** If the task is cancelled while `fetchConfig` is running (which is likely when `URLSession` honours cancellation and returns quickly), the `while !Task.isCancelled` check at the top of the loop was already passed. Execution falls straight through to `Task.sleep`, adding an unnecessary 30-second delay before the loop condition is re-evaluated — even with Issue 1 fixed.

**Fix:** Add a `guard !Task.isCancelled else { break }` statement (CHANGE 2) between the `fetchConfig` call and the `Task.sleep` call. If cancellation arrived during the network call the guard exits the loop before the sleep starts.

**Explanation:** Swift structured concurrency's cooperative cancellation model does not stop execution mid-function; it sets a flag that code must actively check. The `while` condition is only tested once per iteration, at the very top, so any cancellation that occurs during the body of the loop is invisible until the next iteration — which never starts if the sleep hasn't returned yet. Adding an explicit mid-loop check means the two most time-consuming operations (`fetchConfig` and `Task.sleep`) each have a cancellation boundary immediately before them, so the worst-case shutdown latency drops from ~30 s to roughly the duration of a single network request.
